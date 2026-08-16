---
title: "Cắt ariadnev@1.0.0: ba lỗi chỉ lộ khi chạy thật"
date: 2026-08-16
summary: "Release đầu tiên publish immutable, sau khi finalize lộ ba defect trong đường release chưa từng chạy"
---

# Cắt ariadnev@1.0.0: ba lỗi chỉ lộ khi chạy thật

## Kết quả

`ariadnev@1.0.0` đã publish trên `bavanchun/ariadnev-kit`: id `371194315`, `draft: false`,
`immutable: true`, `latest`, tại `6bde116`, đủ 9 asset. Binary tải từ release chạy đúng —
sha256 khớp `checksums.txt`, `--version` trả `1.0.0`, `list` bung được kit nhúng.

`immutable: true` là lần đầu tính chất đó được quan sát trong repo: bốn release cũ
(`vcskill@0.2.0`–`0.5.0`) đều `false` vì có trước khi bật cài đặt.

## Ba defect, một nguyên nhân chung

Cả ba đều nằm trong `finalize-release.yml` và `release-candidate-publish.yml` — đường code
chưa bao giờ chạy tới. Không cái nào liên quan việc xoá cổng web-consumer.

1. **`GET /immutable-releases` trả 403 cho `GITHUB_TOKEN`.** Cần scope administration mà
   workflow token không thể có. Đo bằng nhánh thăm dò: 403 với `contents:write` +
   `actions:read`, và 403 y hệt với **mọi** quyền read cấp được. Máy vận hành đọc được chỉ
   vì token OAuth mang scope `repo` — đó là lý do lỗi này vô hình khi thử tay.

2. **`GET /releases/tags/{tag}` trả 404 cho draft.** Bản chất endpoint, không phải quyền.
   Finalize gọi nó trước PATCH qua hàm hard-fail, nên sửa xong lỗi 1 thì lần dispatch sau
   vẫn đỏ.

3. **Publisher cũng giải held draft theo tag.** Cùng gốc với lỗi 2. Hậu quả nặng hơn: nhánh
   `EXACT-NOOP` không bao giờ đạt được trên production, và một draft sót không tag lọt qua
   cổng xung đột rồi bị đè bằng tag mới.

## Điều đáng rút ra

**Mock dễ dãi hơn thực tế là chỗ trốn của cả lớp lỗi.** `release-stateful-gh-mock.mjs` trả
release cho `/releases/tags/` bất kể `draft`, và có handler cho `/immutable-releases`. Nó dễ
dãi đúng ở hai chỗ production gãy — nên 87 test xanh trong khi đường release không chạy nổi.
Cách sửa đúng là làm mock nói thật **trước**, xem test đỏ ở đâu, rồi mới sửa workflow. Lỗi
thứ ba rơi ra từ chính bước đó, không phải từ việc đi tìm nó.

**Kiểm kết quả mạnh hơn kiểm cài đặt.** Dòng bị xoá assert rằng repo *được cấu hình* để tạo
release immutable. Dòng thay thế assert rằng release *đã publish* là immutable. Cái sau chặt
hơn, và đọc được bằng token workflow. Bảo đảm không giảm khi xoá cổng — nó tăng.

**Soi trước rẻ hơn thử lại.** `finalize-release.yml` ghim vào commit của tag, nên mỗi lần sửa
tốn một vòng dựng 535MB (~20 phút). Trước khi tiêu vòng đó, tôi trích phần read-only của
finalizer và chạy khô trên draft thật với token cá nhân: ~40 assertion, tải artifact 192MB,
giải nén 535MB, đối chiếu 9 digest — sạch. Nếu chỉ vá dòng 403 rồi dispatch lại, tôi đã đâm
vào lỗi 404 và tốn thêm một vòng nữa mà vẫn không thấy lỗi thứ ba.

## Xác nhận phụ

Bất biến trigger tag-absence tự chứng minh hai lần trên production: sau khi tag tồn tại, hai
push tiếp theo đều chạy `Version PR` tới thành công và **skip** cả `candidate-build` lẫn
`candidate-publish`. Tính chất chống cắt trùng mà bất biến cũ ("version vừa đổi") không có.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
