# Pronunciation API Options

## Hiện tại đang dùng (Fallback system):

### 1. Free Dictionary API ⭐ (Primary)
- **URL**: https://dictionaryapi.dev/
- **Cost**: FREE
- **Rate limit**: Không giới hạn rõ ràng
- **Pros**: 
  - Đơn giản, nhanh
  - Không cần API key
  - Có IPA cho hầu hết từ phổ biến
- **Cons**: 
  - Database nhỏ, thiếu một số từ
  - Không có phrases

### 2. Wiktionary API ⭐⭐ (Fallback)
- **URL**: https://en.wiktionary.org/api/
- **Cost**: FREE
- **Rate limit**: Khá rộng
- **Pros**:
  - Database lớn hơn nhiều
  - Có nhiều từ hiếm
  - Community-driven, cập nhật thường xuyên
- **Cons**:
  - Cần parse JSON phức tạp hơn
  - Có thể chậm hơn

## Các APIs khác có thể thêm:

### 3. Merriam-Webster Dictionary API
- **URL**: https://dictionaryapi.com/
- **Cost**: FREE (với API key)
- **Rate limit**: 1000 requests/day (free tier)
- **Setup**: Cần đăng ký để lấy API key
- **Pros**:
  - Chính thức, đáng tin cậy
  - IPA pronunciation chất lượng cao
  - Audio files có sẵn
- **Cons**:
  - Cần API key
  - Rate limit thấp

### 4. Oxford Dictionaries API ❌ (Not recommended)
- **Cost**: PAID ($0.0009 per request)
- **Pros**: Chất lượng cao nhất
- **Cons**: Phải trả phí, không phù hợp cho app miễn phí

### 5. Cambridge Dictionary ❌
- **Official API**: Không có
- **Scraping**: Có thể nhưng vi phạm ToS

### 6. Google Cloud Text-to-Speech ❌
- **Cost**: PAID ($4 per 1M characters)
- **Pros**: Chất lượng tốt, nhiều giọng nói
- **Cons**: 
  - Phải trả phí
  - Không trả về IPA trực tiếp (chỉ có audio)
  - Cần Google Cloud account

### 7. Forvo API (Pronunciation Audio)
- **URL**: https://forvo.com/api/
- **Cost**: FREE với giới hạn
- **Pros**: Có audio pronunciation từ native speakers
- **Cons**: 
  - Cần API key
  - Không có IPA text
  - Chỉ có audio

## Về Google Translate:

**Tại sao không dùng Google Translate?**

1. **Không có official API cho IPA pronunciation**
   - Google Translate API chỉ có text translation
   - Text-to-Speech API chỉ trả về audio, không có IPA

2. **Chrome Extension hoạt động khác**
   - Extension có access đặc biệt vào Chrome APIs
   - Dùng built-in speech synthesis của browser
   - Không phải API public

3. **Nếu muốn tương tự Google Translate**
   - Dùng Google Cloud Text-to-Speech API (paid)
   - Hoặc dùng Web Speech API của browser (free, nhưng offline)

## Web Speech API (Browser built-in) 🎯

Một option khác là dùng **Web Speech API** của browser:

```javascript
const utterance = new SpeechSynthesisUtterance('hello')
utterance.lang = 'en-US'
speechSynthesis.speak(utterance)
```

**Pros**:
- FREE
- Không cần API calls
- Hoạt động offline
- Giống như Google Translate extension

**Cons**:
- Chỉ có audio, không có IPA text
- Quality phụ thuộc vào browser và OS

## Recommendation:

**Current setup (Fallback system) là tốt nhất cho project này:**

✅ Free Dictionary API → Wiktionary API → Fallback to "(no IPA)"

**Nếu muốn thêm Merriam-Webster (recommended nếu cần tăng coverage):**
1. Đăng ký API key tại: https://dictionaryapi.com/register/index
2. Add as 3rd fallback option
3. 1000 requests/day đủ cho most users

**Nếu muốn audio pronunciation (như Google Translate):**
- Option 1: Web Speech API (free, no IPA text)
- Option 2: Forvo API (free tier, có audio)
- Option 3: Google Cloud TTS (paid, best quality)

## Current Implementation:

```javascript
// Try APIs in order:
1. Free Dictionary API (fast, common words)
2. Wiktionary API (comprehensive, rare words)  
3. Return null (show "no IPA")

// All with in-memory cache to reduce API calls
```

## Rate Limiting Strategy:

- ✅ In-memory cache per session
- ✅ Promise.all for parallel requests
- ✅ Fallback system to reduce failures
- ❌ No localStorage cache (quá nhiều data)
- ❌ No aggressive retry (tránh spam)

## Future improvements:

1. Add Merriam-Webster as 3rd fallback (if API key available)
2. Add audio pronunciation button using Web Speech API
3. Pre-fetch common words to reduce API calls
4. Server-side caching if deploy to production
