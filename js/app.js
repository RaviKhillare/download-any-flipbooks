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

    const pagesGrid = document.getElementById('pages-grid');
    let isDownloading = false;

    const updateUI = (percent, message, details) => {
        progressBar.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        statusText.textContent = message;
        if (details) detailText.textContent = details;
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
            }
        }
    };

    const resetUI = () => {
        isDownloading = false;
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<i data-lucide="download"></i><span>Download PDF</span>';
        lucide.createIcons();
    };

    downloadBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();

        if (!url) {
            alert('Please enter a valid flipbook URL.');
            return;
        }

        if (isDownloading) return;

        try {
            isDownloading = true;
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Wait...</span>';
            lucide.createIcons();
            
            statusContainer.classList.remove('hidden');
            updateUI(0, 'Initializing...', 'Detecting platform and preparing download...');

            const count = await window.downloader.startDownload(url, (percent, message, meta) => {
                if (meta) {
                    if (meta.status === 'start') {
                        createGrid(meta.total);
                        updateUI(percent, 'Downloading...', `Found ${meta.total} pages. Starting...`);
                    } else if (meta.status === 'page_start') {
                        updatePageCard(meta.page, 'loading');
                    } else if (meta.status === 'page_success') {
                        updatePageCard(meta.page, 'success');
                        updateUI(percent, 'Downloading...', `Downloaded ${meta.count} / ${meta.total || '?'}`);
                    } else if (meta.status === 'page_error') {
                        updatePageCard(meta.page, 'error');
                    } else if (meta.status === 'compiling') {
                        updateUI(95, 'Compiling PDF...', 'Merging images into high-quality PDF. Please wait.');
                    }
                } else {
                    updateUI(percent, 'Downloading...', message);
                }
            });

            updateUI(100, 'Success!', `Downloaded ${count} pages. Saving PDF...`);
            
            setTimeout(() => {
                statusContainer.classList.add('hidden');
                resetUI();
            }, 5000);

        } catch (error) {
            console.error(error);
            updateUI(0, 'Error', error.message);
            detailText.style.color = 'var(--error)';
            setTimeout(resetUI, 5000);
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
