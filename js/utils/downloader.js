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
        if (url.includes('anyflip.com')) return PLATFORMS.ANYFLIP;
        if (url.includes('fliphtml5.com')) return PLATFORMS.FLIPHTML5;
        if (url.includes('pubhtml5.com')) return PLATFORMS.PUBHTML5;
        return PLATFORMS.UNKNOWN;
    }

    cleanSearchUrl(url) {
        // Remove trailing slashes and index.html
        return url.replace(/\/+$/, '').replace(/\/index\.html$/, '');
    }

    async getPageCount(url) {
        // Try to fetch the page content and find page count in config
        try {
            const response = await fetch(`${PROXY_URL}${encodeURIComponent(url)}`);
            const html = await response.text();
            
            // Look for patterns like "pageCount: 123" or "totalPageCount: 123"
            const match = html.match(/pageCount\s*:\s*(\d+)/i) || html.match(/totalPageCount\s*:\s*(\d+)/i);
            return match ? parseInt(match[1]) : null;
        } catch (e) {
            console.error('Error fetching page count:', e);
            return null;
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
        const platform = this.detectPlatform(url);
        if (platform === PLATFORMS.UNKNOWN) {
            throw new Error('Unsupported platform. Please provide an AnyFlip or FlipHTML5 link.');
        }

        const baseUrl = this.cleanSearchUrl(url);
        let pageCount = await this.getPageCount(baseUrl);
        
        // Fallback: if we can't find page count, we'll try to probe up to 1000 pages
        if (!pageCount) pageCount = 500; 

        const pdf = new this.jsPDF('p', 'mm', 'a4');
        let processedPages = 0;
        let successfulPages = 0;

        for (let i = 1; i <= pageCount; i++) {
            onProgress(Math.floor((i / pageCount) * 100), `Processing page ${i}...`);
            
            // Standard AnyFlip/FlipHTML5 image path
            const imgUrl = `${baseUrl}/files/mobile/${i}.jpg`;
            const dataUrl = await this.downloadImage(imgUrl);

            if (dataUrl) {
                if (successfulPages > 0) pdf.addPage();
                
                // Get image dimensions to fit in A4
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
            } else if (i > 5 && !dataUrl) {
                // If we hit consecutive failures after a few pages, we likely reached the end
                console.log("Stopping at page", i - 1);
                break;
            }
            
            processedPages++;
        }

        if (successfulPages === 0) {
            throw new Error('Could not download any pages. Please check the URL or try another flipbook.');
        }

        pdf.save('flipbook.pdf');
        return successfulPages;
    }
}

window.downloader = new FlipbookDownloader();
