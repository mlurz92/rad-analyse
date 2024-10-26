import { utils } from './main.js';
const { formatFileSize, showError, showSuccess } = utils;

class UploadManager {
    constructor() {
        this.dropzone = document.getElementById('uploadDropzone');
        this.fileInput = document.getElementById('fileInput');
        this.progressBar = null;
        this.progressBarFill = null;
        this.statusText = null;
        this.uploadQueue = [];
        this.currentUploads = 0;
        this.maxConcurrentUploads = 3;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
        this.allowedTypes = ['application/json'];
        this.requiredFields = [
            'Modalität', 'Studiendatum', 'Studienbeschreibung', 'Anfragename',
            'Institution', 'Anfragende Abteilung', 'Anfragender Arzt', 'Überweiser',
            'Berfundverfasser', 'Patientengeschlecht', 'Patientenalter',
            'Diagnose', 'Untersuchungsstatus'
        ];
        
        this.initializeUploadZone();
        this.setupEventListeners();
    }

    initializeUploadZone() {
        this.dropzone.innerHTML = `
            <div class="upload-icon">↑</div>
            <p>JSON-Dateien hier ablegen oder klicken zum Auswählen</p>
            <p class="upload-info">Maximale Dateigröße: 50MB</p>
            <input type="file" id="fileInput" multiple accept="application/json" hidden>
            <div class="upload-progress">
                <div class="upload-progress-bar">
                    <div class="upload-progress-bar-fill"></div>
                </div>
                <p class="upload-status"></p>
            </div>
            <div class="upload-file-list"></div>
        `;
        
        this.progressBar = this.dropzone.querySelector('.upload-progress');
        this.progressBarFill = this.dropzone.querySelector('.upload-progress-bar-fill');
        this.statusText = this.dropzone.querySelector('.upload-status');
        this.fileInput = this.dropzone.querySelector('#fileInput');
        this.fileList = this.dropzone.querySelector('.upload-file-list');
    }

    setupEventListeners() {
        // Drag & Drop Events
        this.dropzone.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        this.dropzone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropzone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.dropzone.addEventListener('drop', (e) => this.handleDrop(e));
        
        // Click to Upload
        this.dropzone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    handleDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('drag-over');
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.relatedTarget || !this.dropzone.contains(e.relatedTarget)) {
            this.dropzone.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        this.processFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.processFiles(files);
        this.fileInput.value = ''; // Reset für erneutes Hochladen der gleichen Datei
    }

    async processFiles(files) {
        const invalidFiles = files.filter(file => !this.validateFile(file));
        
        if (invalidFiles.length > 0) {
            const messages = invalidFiles.map(file => {
                if (file.size > this.maxFileSize) {
                    return `${file.name} ist zu groß (max. 50MB)`;
                }
                return `${file.name} ist keine gültige JSON-Datei`;
            });
            showError(messages.join('\n'));
            return;
        }

        this.showProgress();
        this.uploadQueue.push(...files);
        this.processQueue();
    }

    validateFile(file) {
        if (!this.allowedTypes.includes(file.type)) {
            return false;
        }
        if (file.size > this.maxFileSize) {
            return false;
        }
        return true;
    }

    async validateJsonContent(content) {
        try {
            const data = JSON.parse(content);
            if (!Array.isArray(data)) {
                throw new Error('JSON muss ein Array von Untersuchungen sein');
            }

            data.forEach((item, index) => {
                this.requiredFields.forEach(field => {
                    if (!(field in item)) {
                        throw new Error(`Fehlender Pflichtfeld "${field}" im Datensatz ${index + 1}`);
                    }
                });

                // Datumsformat prüfen
                if (!item.Studiendatum.match(/^\d{2}-\d{2}-\d{4}/)) {
                    throw new Error(`Ungültiges Datumsformat im Datensatz ${index + 1}`);
                }

                // Altersformat prüfen
                if (!item.Patientenalter.match(/^\d+Y$/)) {
                    throw new Error(`Ungültiges Altersformat im Datensatz ${index + 1}`);
                }

                // Geschlecht prüfen
                if (!['M', 'F', 'D'].includes(item.Patientengeschlecht)) {
                    throw new Error(`Ungültiges Geschlecht im Datensatz ${index + 1}`);
                }
            });

            return true;
        } catch (error) {
            throw new Error(`JSON Validierungsfehler: ${error.message}`);
        }
    }

    async processQueue() {
        if (this.currentUploads >= this.maxConcurrentUploads || this.uploadQueue.length === 0) {
            return;
        }

        const file = this.uploadQueue.shift();
        this.currentUploads++;

        try {
            // JSON-Inhalt vor dem Upload validieren
            const content = await this.readFileContent(file);
            await this.validateJsonContent(content);
            
            await this.uploadFile(file, (progress) => {
                const overallProgress = (
                    (this.currentUploads - 1 + progress) / 
                    (this.currentUploads + this.uploadQueue.length)
                ) * 100;
                this.updateProgress(Math.round(overallProgress));
            });

            if (this.uploadQueue.length === 0 && this.currentUploads === 1) {
                this.updateStatus('Upload erfolgreich', 'success');
                showSuccess('Alle Dateien wurden erfolgreich hochgeladen');
                window.tableManager.resetAndReload();
            }
        } catch (error) {
            showError(`Fehler bei ${file.name}: ${error.message}`);
        } finally {
            this.currentUploads--;
            this.processQueue();
        }
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Fehler beim Lesen der Datei'));
            reader.readAsText(file);
        });
    }

    showProgress() {
        this.progressBar.classList.add('active');
        this.updateProgress(0);
        this.updateStatus('Upload läuft...');
        this.progressBarFill.classList.add('animated');
    }

    updateProgress(percent) {
        this.progressBarFill.style.width = `${percent}%`;
    }

    updateStatus(message, type = 'info') {
        this.statusText.textContent = message;
        this.statusText.className = `upload-status ${type}`;
        
        if (type === 'success') {
            setTimeout(() => {
                this.hideProgress();
            }, 3000);
        }
    }

    hideProgress() {
        this.progressBar.classList.remove('active');
        this.progressBarFill.classList.remove('animated');
        setTimeout(() => {
            this.updateProgress(0);
            this.updateStatus('');
        }, 300);
    }

    async uploadFile(file, onProgress) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('files', file);

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    onProgress(e.loaded / e.total);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response.errors && response.errors.length > 0) {
                            reject(new Error(response.errors.join('\n')));
                        } else {
                            resolve(response);
                        }
                    } catch (e) {
                        reject(new Error('Ungültige Server-Antwort'));
                    }
                } else {
                    reject(new Error('Upload fehlgeschlagen'));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Netzwerkfehler beim Upload'));
            });

            xhr.addEventListener('abort', () => {
                reject(new Error('Upload abgebrochen'));
            });

            xhr.open('POST', `${utils.API_BASE_URL}/api/upload`);
            xhr.send(formData);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.uploadManager = new UploadManager();
});

export default UploadManager;