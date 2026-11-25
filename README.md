# VietRead Learn — Extension Dịch Web Sang Tiếng Việt & Vừa Đọc Vừa Học Từ Tiếng Anh

**VietRead Learn** là tiện ích trình duyệt (Chrome / Edge / Brave — Manifest V3) giúp dịch nhanh bất kỳ trang web nào sang tiếng Việt, đồng thời tự động kích hoạt bộ công cụ **vừa đọc báo vừa học từ mới** khi dịch từ tiếng Anh sang tiếng Việt.

## Tính năng nổi bật

### 1. Dịch web thông minh sang Tiếng Việt
- Hỗ trợ tự động nhận diện ngôn ngữ và dịch sang tiếng Việt không cần API key (dùng Google Translate endpoint qua background service worker, tự dự phòng MyMemory khi cần).
- Dịch lười theo vùng nhìn thấy (`IntersectionObserver`) nên mở bài viết dài vẫn cực nhẹ và nhanh, tự nhận diện nội dung động (SPA / cuộn vô hạn).
- Tự động bỏ qua khối mã nguồn (`<code>`, `<pre>`), vùng nhập liệu, và văn bản đã là tiếng Việt.

### 2. Ba chế độ vừa đọc vừa học (Tiếng Anh → Tiếng Việt)
1. **Song ngữ + Học từ (Mặc định)**
   - Giữ đoạn tiếng Anh gốc và hiển thị bản dịch tiếng Việt gọn gàng ngay bên dưới.
   - Tự động lọc bỏ từ cơ bản theo trình độ (`A2+`, `B1–B2`, `C1+`) và gạch chân các từ vựng đáng học kèm **chú thích nghĩa gọn (Inline Gloss)**.
   - Chế độ **Làm mờ bản dịch (`Alt+B`)**: làm mờ tiếng Việt để bạn tập đọc tiếng Anh trước, chỉ cần di chuột hoặc bấm vào khi cần đối chiếu!
2. **Đọc Tiếng Việt, Giữ Từ Tiếng Anh (Immersion Mix)**
   - Dịch toàn bộ sang tiếng Việt tự nhiên nhưng **trộn lại các từ tiếng Anh quan trọng ngay trong câu tiếng Việt** (kèm nghĩa gọn hoặc ẩn nghĩa để tự nhớ), giúp tiếp thu từ mới hoàn toàn tự nhiên mà không gián đoạn tốc độ đọc!
   - Các từ được dịch thoát nghĩa trong ngữ cảnh sẽ hiện ở dải chip *"Từ mới"* nhỏ gọn ngay dưới đoạn văn.
3. **Dịch Thuần Việt**
   - Hiển thị hoàn toàn bằng tiếng Việt cho nhu cầu đọc nhanh, kèm nút `EN` nhỏ ở cuối mỗi đoạn để lật xem câu gốc khi cần.

### 3. Tra từ tức thì, Phát âm, Sổ từ & Ôn tập ngay trên trang
- **Click vào bất kỳ từ nổi bật nào** (hoặc bôi đen / `Alt + double-click` bất kỳ từ nào trên web, kể cả khi chưa bật dịch trang) để mở thẻ từ điển: phiên âm IPA, phát âm chuẩn (MP3 + TTS dự phòng), loại từ, nghĩa tiếng Việt, giải thích tiếng Anh và câu ngữ cảnh từ chính bài viết.
- **Bảng từ vựng bài viết + Quiz nhanh ngay trên trang**: bấm `📚 Từ bài này` ở thanh công cụ nổi góc dưới phải để xem toàn bộ từ mới rút ra từ bài báo và làm bài **Quiz nhanh** ngay sau khi đọc xong.
- **Nhắc lại từ đã lưu trên khắp web**: từ bạn đã lưu sẽ được tô nổi màu vàng cam bất cứ khi nào xuất hiện lại trên các trang web khác!
- **Sổ Từ Vựng & Flashcard lặp lại ngắt quãng (SRS)**: ôn Flashcard theo thuật toán SM-2, làm Trắc nghiệm 2 chiều (`Anh → Việt`, `Việt → Anh`), theo dõi chuỗi ngày học, và xuất ra **Anki (`.tsv`)**, **CSV**, hoặc sao lưu **JSON**.

## Cách cài đặt (Không cần build)

1. Mở Chrome hoặc Edge và truy cập `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
3. Nhấn **Load unpacked (Tải tiện ích đã giải nén)** và chọn thư mục `vietread-learn`.
4. Ghim biểu tượng **VietRead Learn** lên thanh công cụ và bấm `Alt+T` trên bất kỳ trang web tiếng Anh nào để trải nghiệm!

## Phím tắt
- `Alt + T`: Bật / Tắt dịch trang hiện tại.
- `Alt + B`: Bật / Tắt làm mờ bản dịch tiếng Việt.
- `Alt + Double-click` vào từ tiếng Anh: Mở nhanh thẻ tra từ & lưu từ vựng.
"# VietRead-Learn" 
