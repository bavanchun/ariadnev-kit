# Bilingual (VN/EN) HTML Plan Implementation Guide

When `av:plan-i18n` runs against a `plan.html` produced by `av:plan --html`,
the result must be a self-contained, bilingual interactive document
supporting seamless switching between Vietnamese (Tiếng Việt) and English
without page reload.

## Core Requirements

1. **Top-Level Language Toggle Switch:**
   - Positioned prominently in the top folio / navigation header.
   - Distinct visual state indicating active language (e.g. `[🇻🇳 VN | 🇬🇧 EN]`).
   - Persists language preference in `localStorage.getItem('vc_plan_lang') || 'vi'`.

2. **Dual-Language Content Architecture:**
   - **Static UI Elements:** Use `data-en` and `data-vi` attributes or an `i18nDict` lookup object.
   - **Dynamic Phase Data:** Store phase metadata with bilingual fields:
     ```javascript
     const phasesData = [
       {
         id: 1,
         title_en: "Freeze & Backup",
         title_vi: "Đóng băng & Sao lưu",
         objective_en: "Establish safety tag and verify baseline test metrics.",
         objective_vi: "Thiết lập safety tag và xác minh số liệu kiểm thử baseline.",
         bullets_en: ["Create git tag pre-rebrand-backup", "Verify clean working tree"],
         bullets_vi: ["Tạo git tag pre-rebrand-backup", "Xác nhận working tree sạch"],
         markdown_en: "## Overview\n...",
         markdown_vi: "## Tổng quan\n..."
       }
     ];
     ```

3. **Instant Toggle Behavior:**
   - Clicking the toggle updates all UI strings and re-renders the active phase cards and open modals dynamically.
   - If a modal is open when switching languages, the modal's content updates in place immediately.

4. **Example Switcher Component & Script:**

```html
<!-- Switcher in Header -->
<div class="lang-switch-container">
  <button id="lang-btn-vi" class="lang-btn active" onclick="setLanguage('vi')">🇻🇳 Tiếng Việt</button>
  <button id="lang-btn-en" class="lang-btn" onclick="setLanguage('en')">🇬🇧 English</button>
</div>

<script>
  let currentLang = localStorage.getItem('vc_plan_lang') || 'vi';

  const translations = {
    en: {
      planArchive: "PLAN // ARCHIVE",
      statusLabel: "STATUS",
      priorityLabel: "PRIORITY",
      totalEffort: "TOTAL EFFORT",
      targetBranch: "TARGET BRANCH",
      viewSpec: "View Spec →",
      filterAll: "All Phases",
      searchPlaceholder: "Search phases, files, keywords...",
      tabVocab: "Vocabulary Mappings",
      tabMachinery: "Machinery Deletions",
      tabAcceptance: "Acceptance Gates",
      tabRisks: "Risk Matrix",
      modalClose: "Close"
    },
    vi: {
      planArchive: "KẾ HOẠCH // LƯU TRỮ",
      statusLabel: "TRẠNG THÁI",
      priorityLabel: "MỨC ƯU TIÊN",
      totalEffort: "TỔNG THỜI GIAN",
      targetBranch: "BRANCH MỤC TIÊU",
      viewSpec: "Xem chi tiết →",
      filterAll: "Tất cả giai đoạn",
      searchPlaceholder: "Tìm kiếm giai đoạn, tập tin, từ khóa...",
      tabVocab: "Bảng chuyển đổi từ vựng",
      tabMachinery: "Danh mục tệp loại bỏ",
      tabAcceptance: "Tiêu chuẩn nghiệm thu",
      tabRisks: "Ma trận rủi ro",
      modalClose: "Đóng"
    }
  };

  function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('vc_plan_lang', lang);

    document.getElementById('lang-btn-vi').classList.toggle('active', lang === 'vi');
    document.getElementById('lang-btn-en').classList.toggle('active', lang === 'en');

    // Update static i18n text
    document.querySelectorAll('[data-i18n-key]').forEach(el => {
      const key = el.getAttribute('data-i18n-key');
      if (translations[lang] && translations[lang][key]) {
        el.innerText = translations[lang][key];
      }
    });

    // Re-render phase cards
    renderPhaseCards();

    // Re-render modal if open
    if (activeModalPhaseId !== null) {
      openModal(activeModalPhaseId);
    }
  }
</script>
```
