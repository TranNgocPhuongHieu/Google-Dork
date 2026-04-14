# Google Search Crawler 🚀

Một công cụ mạnh mẽ, được xây dựng trên nền tảng **Crawlee** và **Playwright**, chuyên dụng để thu thập dữ liệu từ kết quả tìm kiếm Google với các cơ chế chống chặn (anti-bot) nâng cao.

## 🌟 Tính năng nổi bật

- **Chống chặn thông minh**: Tích hợp xoay tua Proxy (Proxy Rotation) và giả lập trình duyệt Playwright để vượt qua các rào cản từ Google.
- **Tùy biến cao**: Kiểm soát tốt các tham số tìm kiếm, dải ngày (date range) và số lượng trang kết quả.
- **Tự động chia nhỏ truy vấn**: Hỗ trợ split dải ngày để tìm kiếm sâu hơn, tránh bị giới hạn kết quả từ Google.
- **Xử lý dữ liệu trùng lặp**: Tích hợp cơ chế Deduplication để đảm bảo dữ liệu thu thập không bị lặp lại giữa các lần chạy.
- **Đa nền tảng**: Tối ưu hóa việc tìm kiếm các liên kết từ mạng xã hội (Facebook, Instagram, X/Twitter).
- **Xuất dữ liệu**: Kết quả được lưu dưới dạng JSON có cấu trúc, phân loại theo từng nền tảng và dải ngày.

## 🛠️ Yêu cầu hệ thống

- **Node.js**: Phiên bản 20 trở lên.
- **Trình duyệt**: Tự động cài đặt thông qua Playwright.
- **Proxy**: Khuyên dùng danh sách Proxy tĩnh hoặc Proxy xoay tua để đảm bảo độ ổn định cao nhất.

## 🚀 Cài đặt

1. **Clone dự án**:
   ```bash
   git clone https://github.com/YOUR_USER/google-search.git
   cd google-search
   ```

2. **Cài đặt thư viện**:
   ```bash
   npm install
   ```

3. **Cài đặt trình duyệt Playwright**:
   ```bash
   npx playwright install chromium
   ```

## ⚙️ Cấu hình

Tạo file `.env` từ file mẫu `.env.example`:

```bash
cp .env.example .env
```

Cập nhật các thông số cần thiết trong `.env`:


## 🏃 Sử dụng

Chạy crawler:

```bash
npm start
```

Kết quả sẽ được lưu trong thư mục `results/` dưới dạng các file JSON.

