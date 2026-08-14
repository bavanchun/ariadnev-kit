# Python dependency draft — 22 skill mang script Python

> **Trạng thái: BẢN NHÁP, CẦN NGƯỜI REVIEW.** Sinh bởi
> `packages/cli/scripts/scan-python-imports.mjs`. Không được cài trực tiếp từ file này:
> tên module không định danh tin cậy được gói phân phối (`PIL` → `pillow`,
> `cv2` → `opencv-python`), nên mọi module chưa có trong bảng map đều được báo là
> **unknown** thay vì đoán.

Quét trên cây skill nguồn (ngoài repo), ngày 2026-08-14.

## Phát hiện chính: tiền đề của phase 7 sai về quy mô

Phase 7 giả định 22 skill Python cần một venv chung ~383MB. Số liệu thật:

| Nhóm | Số skill | Cần venv? |
|---|---|---|
| Chỉ dùng thư viện chuẩn | 8 | Không |
| Chỉ khai báo `pytest*` (công cụ test, không phải runtime) | 9 | Không |
| Có dependency runtime thật | 5 | Có |

**17/22 skill không cần gói Python nào để chạy.** Con số 383MB gần như toàn bộ đến từ
`cti-expert` (matplotlib + numpy + scrapling) và `design` (scikit-learn + pillow).

Đáng chú ý: 8 trong 10 file `requirements.txt` ở nguồn **chỉ** khai báo
`pytest`/`pytest-cov`/`pytest-mock`. Đó là thứ bộ test cần, không phải thứ script cần —
đọc chúng như khai báo runtime sẽ cài pytest vào môi trường của người dùng mà không có
tác dụng gì.

## Cần map bằng tay trước khi vào lockfile

| Module | Skill | Gợi ý |
|---|---|---|
| `psycopg2` | databases | `psycopg2-binary` — bản `psycopg2` cần toolchain build |
| `pymongo` | databases | `pymongo` |
| `lxml`, `defusedxml`, `six` | document-skills | tên gói trùng tên module |
| `pdf2image` | document-skills, pdf | `pdf2image` + **poppler** (binary hệ thống) |
| `google` | design | mơ hồ — cần xem import cụ thể |
| `win_compat`, `ooxml`, `skills`, `validation` | nhiều | **module nội bộ**, không phải dependency |

`win_compat`/`ooxml`/`skills`/`validation` xuất hiện vì chúng được import từ thư mục khác
trong cùng skill; bộ quét chỉ coi file `.py` **cùng thư mục** là module nội bộ.

## Phụ thuộc ngoài Python

Nhiều skill cần binary hệ thống chứ không cần gói Python — `ffmpeg`/`imagemagick`
(media-processing), Node CLI (`repomix`, `@shopify/cli`), poppler (pdf2image),
trình duyệt của `playwright` (excalidraw). Venv không giải quyết được nhóm này.

## Kết quả quét thô

```text
# Python dependency draft — REVIEW BEFORE USE

Scanned 26 skill(s) shipping Python under <source skills root>

- ak-ai-artist — 3 file(s): (stdlib only)
- ak-better-auth — 2 file(s): pytest
- ak-chrome-profile — 2 file(s): (stdlib only)
- ak-context-engineering — 3 file(s): pytest
- ak-copywriting — 1 file(s): (stdlib only)
- ak-cti-expert — 7 file(s): matplotlib, networkx, numpy, python-docx
- ak-databases — 6 file(s): pytest
    unknown module(s), map by hand: psycopg2, pymongo, win_compat
- ak-design — 13 file(s): numpy, pillow, scikit-learn
    unknown module(s), map by hand: google
- ak-devops — 4 file(s): pytest
    unknown module(s), map by hand: win_compat
- ak-document-skills — 32 file(s): openpyxl, pillow, pypdf
    unknown module(s), map by hand: defusedxml, lxml, ooxml, pdf2image, six, skills, validation, win_compat
- ak-excalidraw — 1 file(s): playwright
- ak-llms — 1 file(s): (stdlib only)
- ak-mcp-builder — 2 file(s): anthropic, mcp
- ak-media-processing — 6 file(s): pytest
- ak-repomix — 2 file(s): pytest
- ak-shopify — 2 file(s): pytest
- ak-skill-creator — 4 file(s): (stdlib only)
- ak-tech-graph — 1 file(s): (stdlib only)
- ak-threejs — 4 file(s): (stdlib only)
- ak-ui-styling — 4 file(s): pytest
- ak-ui-ux-pro-max — 4 file(s): (stdlib only)
- ak-web-frameworks — 5 file(s): pytest
- docx — 11 file(s): (stdlib only)
    unknown module(s), map by hand: defusedxml, lxml, ooxml, skills, validation
- pdf — 8 file(s): pillow, pypdf
    unknown module(s), map by hand: pdf2image
- pptx — 12 file(s): pillow
    unknown module(s), map by hand: defusedxml, lxml, six, validation
- xlsx — 1 file(s): openpyxl
    unknown module(s), map by hand: win_compat
```
