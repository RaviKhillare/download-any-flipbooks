/**
 * Main Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('flipbook-url');
    const downloadBtn = document.getElementById('download-btn');
    const statusContainer = document.getElementById('status-container');
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status-text');
    const progressPercent = document.getElementById('progress-percent');
    const detailText = document.getElementById('detail-text');

    const summaryContainer = document.getElementById('download-summary');
    const downloadedCountEl = document.getElementById('downloaded-count');
    const skippedCountEl = document.getElementById('skipped-count');
    const retryBtn = document.getElementById('retry-btn');
    const finishBtn = document.getElementById('finish-btn');

    const pagesGrid = document.getElementById('pages-grid');
    let isDownloading = false;

    const updateUI = (percent, message, details) => {
        progressBar.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        statusText.textContent = message;
        if (details) detailText.textContent = details;
    };

    const updateSummary = (completed, skipped) => {
        downloadedCountEl.textContent = completed;
        skippedCountEl.textContent = skipped;
        
        if (skipped > 0) {
            retryBtn.classList.remove('hidden');
        } else {
            retryBtn.classList.add('hidden');
        }
        summaryContainer.classList.remove('hidden');
    };

    const createGrid = (total) => {
        pagesGrid.innerHTML = '';
        for (let i = 1; i <= total; i++) {
            const card = document.createElement('div');
            card.className = 'page-card';
            card.id = `page-${i}`;
            card.textContent = i;
            pagesGrid.appendChild(card);
        }
    };

    const updatePageCard = (page, status) => {
        const card = document.getElementById(`page-${page}`);
        if (card) {
            card.className = `page-card ${status}`;
            if (status === 'success') {
                card.innerHTML = '<i data-lucide="check" style="width:12px; height:12px;"></i>';
                lucide.createIcons();
            } else if (status === 'error') {
                card.innerHTML = '<i data-lucide="x" style="width:12px; height:12px;"></i>';
                lucide.createIcons();
            }
        }
    };

    const resetUI = () => {
        isDownloading = false;
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<i data-lucide="download"></i><span>Download PDF</span>';
        summaryContainer.classList.add('hidden');
        lucide.createIcons();
    };

    const runDownloadBatch = async (pages) => {
        const result = await window.downloader.downloadPages(pages, (percent, message, meta) => {
            if (meta) {
                if (meta.status === 'page_start') {
                    updatePageCard(meta.page, 'loading');
                } else if (meta.status === 'page_success') {
                    updatePageCard(meta.page, 'success');
                    updateUI(percent, 'Downloading...', `Downloaded ${meta.count} / ${meta.total || '?'}`);
                } else if (meta.status === 'page_error') {
                    updatePageCard(meta.page, 'error');
                }
            } else {
                updateUI(percent, 'Downloading...', message);
            }
        });
        updateSummary(result.completed, result.skipped);
        return result;
    };

    downloadBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url || isDownloading) return;

        try {
            isDownloading = true;
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Processing...</span>';
            lucide.createIcons();
            
            statusContainer.classList.remove('hidden');
            summaryContainer.classList.add('hidden');
            updateUI(0, 'Initializing...', 'Detecting platform and preparing download...');

            const totalPages = await window.downloader.init(url, (percent, message, meta) => {
                if (meta && meta.status === 'start') {
                    createGrid(meta.total);
                }
                updateUI(percent, 'Initializing...', message);
            });

            const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);
            await runDownloadBatch(allPages);
            
            updateUI(100, 'Batch Complete', 'Review results and generate PDF.');

        } catch (error) {
            console.error(error);
            updateUI(0, 'Error', error.message);
            detailText.style.color = 'var(--error)';
            setTimeout(resetUI, 5000);
        } finally {
            isDownloading = false;
        }
    });

    retryBtn.addEventListener('click', async () => {
        if (isDownloading) return;
        const skipped = window.downloader.skippedPages;
        if (skipped.length === 0) return;

        try {
            isDownloading = true;
            retryBtn.disabled = true;
            retryBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Retrying...</span>';
            lucide.createIcons();

            await runDownloadBatch(skipped);
            updateUI(100, 'Retry Complete', 'Summary updated.');
        } catch (error) {
            alert('Retry failed: ' + error.message);
        } finally {
            isDownloading = false;
            retryBtn.disabled = false;
            retryBtn.innerHTML = '<i data-lucide="refresh-cw"></i><span>Retry Skipped</span>';
            lucide.createIcons();
        }
    });

    finishBtn.addEventListener('click', async () => {
        if (isDownloading) return;
        try {
            isDownloading = true;
            finishBtn.disabled = true;
            finishBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Saving...</span>';
            lucide.createIcons();

            await window.downloader.generatePDF((percent, message) => {
                updateUI(percent, 'Generating PDF...', message);
            });

            updateUI(100, 'Success!', 'PDF saved successfully.');
            setTimeout(() => {
                statusContainer.classList.add('hidden');
                resetUI();
            }, 3000);
        } catch (error) {
            alert('PDF creation failed: ' + error.message);
        } finally {
            isDownloading = false;
            finishBtn.disabled = false;
            finishBtn.innerHTML = '<i data-lucide="file-check"></i><span>Generate PDF</span>';
            lucide.createIcons();
        }
    });


    // Add spin animation class to CSS dynamically if needed, or just use CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .spin {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
});
