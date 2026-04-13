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
        this.resetSession();
    }

    resetSession() {
        this.images = [];
        this.pageCount = 0;
        this.baseUrl = '';
        this.platform = PLATFORMS.UNKNOWN;
        this.pdf = null;
        this.completedCount = 0;
        this.skippedPages = [];
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
                await new Promise(r => setTimeout(r, 500 * (i + 1)));
            }
        }
    }

    async init(url, onProgress) {
        this.resetSession();
        this.baseUrl = this.cleanSearchUrl(url);
        onProgress(0, 'Analyzing flipbook...', { status: 'init' });
        
        let { count: pageCount, engine: detectedEngine } = await this.getPageCount(this.baseUrl);
        this.platform = this.detectPlatform(url);
        
        if (this.platform === PLATFORMS.UNKNOWN) this.platform = detectedEngine || PLATFORMS.FLIPHTML5;
        if (!pageCount) pageCount = 500; 
        
        this.pageCount = pageCount;
        this.images = new Array(this.pageCount);
        
        onProgress(0, `Found ${this.pageCount} pages. Ready to start download.`, { status: 'start', total: this.pageCount });
        return this.pageCount;
    }

    async downloadPages(pageNumbers, onProgress) {
        const CONCURRENCY_LIMIT = 8;
        const totalToDownload = pageNumbers.length;
        let batchCompleted = 0;
        const queue = [...pageNumbers];
        
        this.skippedPages = this.skippedPages.filter(p => !pageNumbers.includes(p));

        const worker = async () => {
            while (queue.length > 0) {
                const pageNum = queue.shift();
                onProgress(Math.floor((this.completedCount / this.pageCount) * 100), `Downloading page ${pageNum}...`, { status: 'page_start', page: pageNum });
                
                let dataUrl = await this.downloadImage(`${this.baseUrl}/files/mobile/${pageNum}.jpg`);
                
                if (!dataUrl) {
                    onProgress(Math.floor((this.completedCount / this.pageCount) * 100), `Retrying page ${pageNum} (LQ)...`, { status: 'page_start', page: pageNum });
                    dataUrl = await this.downloadImage(`${this.baseUrl}/files/shot/${pageNum}.jpg`);
                }

                if (!dataUrl) {
                    dataUrl = await this.downloadImage(`${this.baseUrl}/files/large/${pageNum}.jpg`);
                }

                if (dataUrl) {
                    this.images[pageNum - 1] = dataUrl;
                    this.completedCount++;
                    batchCompleted++;
                    onProgress(Math.floor((this.completedCount / this.pageCount) * 100), `Page ${pageNum} ready`, { status: 'page_success', page: pageNum, count: this.completedCount, total: this.pageCount });
                } else {
                    if (!this.skippedPages.includes(pageNum)) {
                        this.skippedPages.push(pageNum);
                    }
                    onProgress(Math.floor((this.completedCount / this.pageCount) * 100), `Skipped page ${pageNum}`, { status: 'page_error', page: pageNum });
                    
                    // Break if we hit 10 consecutive failures (likely end of book) ONLY if we are doing a full range
                    if (pageNumbers.length > 50 && pageNum > 10 && !this.images.slice(Math.max(0, pageNum - 5), pageNum - 1).some(x => x)) {
                        queue.length = 0; 
                    }
                }
            }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, queue.length) }, () => worker());
        await Promise.all(workers);
        
        return {
            completed: this.completedCount,
            skipped: this.skippedPages.length
        };
    }

    async generatePDF(onProgress) {
        if (onProgress) onProgress(95, 'Finalizing PDF...', { status: 'compiling' });
        
        const pdf = new this.jsPDF('p', 'mm', 'a4');
        let successfulPages = 0;
        
        for (let i = 0; i < this.images.length; i++) {
            const dataUrl = this.images[i];
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

        if (successfulPages === 0) throw new Error('No pages downloaded to generate PDF.');

        pdf.save(`flipbook_${Date.now()}.pdf`);
        return successfulPages;
    }
}

window.downloader = new FlipbookDownloader();
