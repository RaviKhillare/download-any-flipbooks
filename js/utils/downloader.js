/**
 * Downloader Utility for Flipbooks
 */

const PROXY_URL = 'https://api.allorigins.win/raw?url=';

const PLATFORMS = {
    ANYFLIP: 'anyflip',
    FLIPHTML5: 'fliphtml5',
    PUBHTML5: 'pubhtml5',
    UNKNOWN: 'unknown'
};

class FlipbookDownloader {
    constructor() {
        this.jsPDF = window.jspdf.jsPDF;
    }

    detectPlatform(url) {
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('anyflip.com')) return PLATFORMS.ANYFLIP;
        if (lowerUrl.includes('fliphtml5.com')) return PLATFORMS.FLIPHTML5;
        if (lowerUrl.includes('pubhtml5.com')) return PLATFORMS.PUBHTML5;
        
        // Generic detection logic
        return PLATFORMS.UNKNOWN;
    }

    cleanSearchUrl(url) {
        // Remove trailing slashes and index.html
        return url.replace(/\/+$/, '').replace(/\/index\.html$/, '');
    }

    async getPageCount(url) {
        try {
            const response = await fetch(`${PROXY_URL}${encodeURIComponent(url)}`);
            const html = await response.text();
            
            // Engines often have unique signatures
            const isAnyFlip = html.includes('anyflip') || html.includes('AnyFlip');
            const isFlipHTML5 = html.includes('fliphtml5') || html.includes('FlipHTML5');

            // Look for patterns like "pageCount: 123" or "totalPageCount: 123"
            const match = html.match(/pageCount\s*:\s*(\d+)/i) || 
                          html.match(/totalPageCount\s*:\s*(\d+)/i) ||
                          html.match(/"pageCount"\s*:\s*(\d+)/i);
            
            const count = match ? parseInt(match[1]) : null;
            return { count, engine: isFlipHTML5 ? PLATFORMS.FLIPHTML5 : (isAnyFlip ? PLATFORMS.ANYFLIP : null) };
        } catch (e) {
            console.error('Error fetching page count:', e);
            return { count: null, engine: null };
        }
    }

    async downloadImage(url) {
        try {
            // Using AllOrigins proxy for images too, to bypass CORS
            const response = await fetch(`${PROXY_URL}${encodeURIComponent(url)}`);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn(`Failed to download image: ${url}`, e);
            return null;
        }
    }

    async startDownload(url, onProgress) {
        const baseUrl = this.cleanSearchUrl(url);
        onProgress(0, 'Analyzing flipbook...', { status: 'init' });
        
        let { count: pageCount, engine: detectedEngine } = await this.getPageCount(baseUrl);
        let platform = this.detectPlatform(url);
        
        if (platform === PLATFORMS.UNKNOWN) {
            platform = detectedEngine || PLATFORMS.FLIPHTML5;
        }

        if (!pageCount) pageCount = 500; 
        
        // Notify UI of total page count
        onProgress(0, `Found ${pageCount} pages. Starting parallel download...`, { status: 'start', total: pageCount });

        const pdf = new this.jsPDF('p', 'mm', 'a4');
        const images = new Array(pageCount);
        let completedCount = 0;
        const CONCURRENCY_LIMIT = 5;
        
        const downloadQueue = Array.from({ length: pageCount }, (_, i) => i + 1);
        
        const worker = async () => {
            while (downloadQueue.length > 0) {
                const pageNum = downloadQueue.shift();
                onProgress(Math.floor((completedCount / pageCount) * 100), `Downloading page ${pageNum}...`, { status: 'page_start', page: pageNum });
                
                const imgUrl = `${baseUrl}/files/mobile/${pageNum}.jpg`;
                const dataUrl = await this.downloadImage(imgUrl);

                if (dataUrl) {
                    images[pageNum - 1] = dataUrl;
                    completedCount++;
                    onProgress(Math.floor((completedCount / pageCount) * 100), `Page ${pageNum} ready`, { status: 'page_success', page: pageNum, count: completedCount });
                } else {
                    console.warn(`Could not download page ${pageNum}`);
                    onProgress(Math.floor((completedCount / pageCount) * 100), `Failed page ${pageNum}`, { status: 'page_error', page: pageNum });
                    
                    // If we hit consecutive failures at the end, stop the queue
                    if (pageNum > 10 && !images.slice(Math.max(0, pageNum - 5), pageNum - 1).some(x => x)) {
                        downloadQueue.length = 0; 
                    }
                }
            }
        };

        // Start workers
        const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, pageCount) }, () => worker());
        await Promise.all(workers);

        // Compile PDF
        onProgress(95, 'Compiling PDF...', { status: 'compiling' });
        
        let successfulPages = 0;
        for (let i = 0; i < images.length; i++) {
            const dataUrl = images[i];
            if (!dataUrl) continue;

            if (successfulPages > 0) pdf.addPage();
            
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = dataUrl; });
            
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const imgRatio = img.width / img.height;
            const pageRatio = pageWidth / pageHeight;

            let w, h;
            if (imgRatio > pageRatio) {
                w = pageWidth;
                h = pageWidth / imgRatio;
            } else {
                h = pageHeight;
                w = pageHeight * imgRatio;
            }

            pdf.addImage(dataUrl, 'JPEG', (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
            successfulPages++;
        }

        if (successfulPages === 0) {
            throw new Error('Could not download any pages.');
        }

        pdf.save('flipbook.pdf');
        return successfulPages;
    }
}

window.downloader = new FlipbookDownloader();
