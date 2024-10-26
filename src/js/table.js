import { utils } from './main.js';
const { fetchStudies, showError, showSuccess } = utils;

class TableManager {
    constructor() {
        this.table = document.getElementById('studiesTable');
        this.thead = this.table.querySelector('thead');
        this.tbody = this.table.querySelector('tbody');
        this.currentPage = 0;
        this.isLoading = false;
        this.initializeTable();
    }

    async initializeTable() {
        try {
            await this.loadPage(this.currentPage);
            window.filterManager.initializeFilters(); // Falls FilterManager von TableManager abhängt
        } catch (error) {
            showError('Fehler beim Initialisieren der Tabelle: ' + error.message);
        }
    }

    async loadPage(page) {
        if (this.isLoading) return;
        this.isLoading = true;
        const studies = await fetchStudies(page);
        if (studies.length === 0) return;
        this.renderStudies(studies);
        this.currentPage++;
        this.isLoading = false;
    }

    renderStudies(studies) {
        if (this.thead.rows.length === 0) {
            this.createTableHeaders(Object.keys(studies[0]));
        }

        studies.forEach(study => {
            const row = document.createElement('tr');
            Object.values(study).forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                row.appendChild(td);
            });
            this.tbody.appendChild(row);
        });
    }

    createTableHeaders(columns) {
        const headerRow = document.createElement('tr');
        columns.forEach(column => {
            const th = document.createElement('th');
            th.textContent = column;
            th.dataset.column = this.convertHeaderToDataColumn(column);
            headerRow.appendChild(th);
        });
        this.thead.appendChild(headerRow);
    }

    convertHeaderToDataColumn(header) {
        // Beispielhafte Umwandlung: 'Anfragender Arzt' -> 'anfragender_arzt'
        return header.toLowerCase().replace(/\s+/g, '_').replace(/[äöü]/g, (match) => {
            switch(match) {
                case 'ä': return 'ae';
                case 'ö': return 'oe';
                case 'ü': return 'ue';
                default: return match;
            }
        });
    }

    resetAndReload() {
        this.tbody.innerHTML = '';
        this.currentPage = 0;
        this.initializeTable();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.tableManager = new TableManager();

    // Event für dynamisches Nachladen beim Scrollen
    window.addEventListener('scroll', utils.debounce(() => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
            window.tableManager.loadPage(window.tableManager.currentPage);
        }
    }, 300));
});

export default TableManager;