/**
 * Downloader Utility for Flipbooks
 */

const HTML_PROXY = 'https://api.allorigins.win/raw?url=';
const IMAGE_PROXY = 'https://wsrv.nl/?url=';

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
        return PLATFORMS.UNKNOWN;
    }

    cleanSearchUrl(url) {
        return url.replace(/\/+$/, '').replace(/\/index\.html$/, '');
    }

    async getPageCount(url) {
        try {
            const response = await fetch(`${HTML_PROXY}${encodeURIComponent(url)}`);
            const html = await response.text();
            
            const isAnyFlip = html.includes('anyflip') || html.includes('AnyFlip');
            const isFlipHTML5 = html.includes('fliphtml5') || html.includes('FlipHTML5');

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

    async downloadImage(url, retries = 2) {
        // Weserv is great but we'll optimize the images to make them faster
        // &q=70 reduces size significantly with minimal quality loss
        const proxiedUrl = `${IMAGE_PROXY}${encodeURIComponent(url)}&q=70&output=jpg`;
        
        for (let i = 0; i <= retries; i++) {
            try {
                const response = await fetch(proxiedUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const blob = await response.blob();
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                if (i === retries) {
                    console.warn(`Failed to download image after ${retries} retries: ${url}`, e);
                    return null;
                }
                // Exponential backoff
                await new Promise(r => setTimeout(r, 500 * (i + 1)));
            }
        }
    }

    async startDownload(url, onProgress) {
        const baseUrl = this.cleanSearchUrl(url);
        onProgress(0, 'Analyzing flipbook...', { status: 'init' });
        
        let { count: pageCount, engine: detectedEngine } = await this.getPageCount(baseUrl);
        let platform = this.detectPlatform(url);
        
        if (platform === PLATFORMS.UNKNOWN) platform = detectedEngine || PLATFORMS.FLIPHTML5;
        if (!pageCount) pageCount = 500; 
        
        onProgress(0, `Found ${pageCount} pages. Starting high-speed download...`, { status: 'start', total: pageCount });

        const pdf = new this.jsPDF('p', 'mm', 'a4');
        const images = new Array(pageCount);
        let completedCount = 0;
        const CONCURRENCY_LIMIT = 8; // Weserv handles high concurrency like a pro
        
        const downloadQueue = Array.from({ length: pageCount }, (_, i) => i + 1);
        
        const worker = async () => {
            while (downloadQueue.length > 0) {
                const pageNum = downloadQueue.shift();
                onProgress(Math.floor((completedCount / pageCount) * 100), `Downloading page ${pageNum}...`, { status: 'page_start', page: pageNum });
                
                // Primary path: files/mobile/n.jpg
                let dataUrl = await this.downloadImage(`${baseUrl}/files/mobile/${pageNum}.jpg`);
                
                // Fallback 1: files/shot/n.jpg (Usually exists as thumbnail/preview)
                if (!dataUrl) {
                    onProgress(Math.floor((completedCount / pageCount) * 100), `Retrying page ${pageNum} (LQ)...`, { status: 'page_start', page: pageNum });
                    dataUrl = await this.downloadImage(`${baseUrl}/files/shot/${pageNum}.jpg`);
                }

                // Fallback 2: files/large/n.jpg (High Quality)
                if (!dataUrl) {
                    dataUrl = await this.downloadImage(`${baseUrl}/files/large/${pageNum}.jpg`);
                }

                if (dataUrl) {
                    images[pageNum - 1] = dataUrl;
                    completedCount++;
                    onProgress(Math.floor((completedCount / pageCount) * 100), `Page ${pageNum} ready`, { status: 'page_success', page: pageNum, count: completedCount, total: pageCount });
                } else {
                    onProgress(Math.floor((completedCount / pageCount) * 100), `Skipped page ${pageNum}`, { status: 'page_error', page: pageNum });
                    
                    // Break if we hit 10 consecutive failures (likely end of book)
                    if (pageNum > 10 && !images.slice(Math.max(0, pageNum - 5), pageNum - 1).some(x => x)) {
                        downloadQueue.length = 0; 
                    }
                }
            }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, pageCount) }, () => worker());
        await Promise.all(workers);

        onProgress(95, 'Finalizing PDF...', { status: 'compiling' });
        
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

        if (successfulPages === 0) throw new Error('Download failed completely. Try again later.');

        pdf.save(`flipbook_${Date.now()}.pdf`);
        return successfulPages;
    }
}

window.downloader = new FlipbookDownloader();
