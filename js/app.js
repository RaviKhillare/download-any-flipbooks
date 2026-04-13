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

    let isDownloading = false;

    const updateUI = (percent, message, details) => {
        progressBar.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        statusText.textContent = message;
        if (details) detailText.textContent = details;
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

            const count = await window.downloader.startDownload(url, (percent, message) => {
                updateUI(percent, 'Downloading...', message);
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
