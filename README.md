# Google Search Crawler 🚀

A high-performance search engine scraping tool built on **Crawlee** and **Playwright**, designed for automated data extraction with advanced anti-bot detection and proxy management.

## 🌟 Key Features

- **Smart Anti-Bot Bypass**: Integrated Proxy Rotation and Playwright browser fingerprinting to minimize detection.
- **Granular Search Control**: Precise control over search queries, date ranges, and pagination.
- **Intelligent Query Splitting**: Automatically splits date ranges into manageable chunks to maximize result density.
- **Cross-Run Deduplication**: Persistent deduplication mechanism ensuring unique results across multiple executions.
- **Multi-Platform Focus**: Optimized for extracting social media footprints from Facebook, Instagram, and X (Twitter).
- **Professional Export**: Structures data into clean **JSON** and office-ready **Excel (.xlsx)** formats.

## 🛠️ Prerequisites

- **Node.js**: Version 20 or higher.
- **Chromium**: Automatically managed via Playwright.
- **Proxy**: Recommended to use static or rotating proxy providers for high-volume scraping.

## 🚀 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USER/google-search.git
   cd google-search
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```

## ⚙️ Configuration

Copy the example environment file and update it with your credentials:

```bash
cp .env.example .env
```

## 🏃 Usage

Launch the crawler using the following command:

```bash
npm start
```

Results will be generated in the `results/` directory in both JSON and XLSX formats.

## ⚖️ License

This project is licensed under the [MIT License](LICENSE). Please use this tool responsibly and in compliance with Google's Terms of Service.
