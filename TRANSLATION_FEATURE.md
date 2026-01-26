# Vietnamese Translation Feature 🇻🇳

## Overview

Tự động dịch tất cả từ vựng sang tiếng Việt và hiển thị ngay dưới definition.

## How It Works

### 1. **Auto-fetch when showing transcript**
- Khi user click "Show" transcript
- System tự động fetch:
  - IPA pronunciation (từ Free Dictionary API + Wiktionary)
  - Vietnamese translation (từ MyMemory API)
  - Cả hai chạy **song song** (parallel) để nhanh hơn

### 2. **Display Format**

```
Word: grab /ɡræb/ 🔊
Type: verb
Definition: get quickly (lấy nhanh, nắm)
                        ↑
               Vietnamese translation
```

## Translation API

### MyMemory Translation API
- **URL**: https://mymemory.translated.net/
- **Cost**: FREE
- **Rate Limit**: 
  - Anonymous: 1000 requests/day
  - With email: 10,000 requests/day
- **Quality**: 
  - Good for common words ⭐⭐⭐⭐
  - OK for phrases ⭐⭐⭐
  - Context-aware translations

### Why MyMemory?

✅ **Free** - Không cần API key  
✅ **No registration** - Hoạt động ngay lập tức  
✅ **Good coverage** - Database lớn với nhiều ngôn ngữ  
✅ **Context-aware** - Dịch theo ngữ cảnh tốt hơn Google Translate free tier  
✅ **Reliable** - Uptime cao, ít downtime  

### Alternatives

| API | Cost | Quality | Setup |
|-----|------|---------|-------|
| MyMemory | FREE | ⭐⭐⭐⭐ | No registration |
| Google Translate | PAID | ⭐⭐⭐⭐⭐ | Need API key + billing |
| DeepL | FREE tier | ⭐⭐⭐⭐⭐ | Need API key (500k chars/month) |
| Microsoft Translator | FREE tier | ⭐⭐⭐⭐ | Need API key (2M chars/month) |
| LibreTranslate | FREE | ⭐⭐⭐ | Self-hosted or API key |

## Features

### ✅ Current Features:

1. **Automatic Translation**
   - Fetch khi show transcript
   - Hiển thị trong definition
   
2. **Parallel Fetching**
   - IPA và translation fetch cùng lúc
   - Không làm chậm app
   
3. **In-memory Cache**
   - Cache translation để tránh fetch lại
   - Share cache với pronunciation
   
4. **Vietnamese Flag** 🇻🇳
   - Progress indicator có flag Việt Nam
   - User biết đang fetch translation

5. **Styled Display**
   - Translation màu indigo (nổi bật)
   - Italic font để phân biệt với definition
   - Nằm trong ngoặc đơn

### 🚀 Future Enhancements:

1. **Toggle translation on/off**
   - Button để ẩn/hiện translation
   - Save preference trong localStorage

2. **Multiple languages**
   - Support thêm các ngôn ngữ khác
   - Language selector

3. **Better translation quality**
   - Add DeepL as fallback (nếu có API key)
   - Context-aware translation từ câu dialogue

4. **Translation audio**
   - Text-to-speech cho Vietnamese translation
   - Giúp học phát âm tiếng Việt

## Example Output

### Before:
```
grab
principle verb, present simple
get quickly
```

### After:
```
grab /ɡræb/ 🔊
principle verb, present simple  
get quickly (lấy nhanh, nắm)
```

## Console Logs

```
Fetching pronunciations for 10 words...
Starting Promise.allSettled for all words...

Processing word "grab":
✓ Added IPA: "grab" -> /ɡræb/
✓ Added translation: "grab" -> lấy nhanh, nắm

Processing word "complimentary":
✓ Added IPA: "complimentary" -> /ˌkɑmplɪˈmɛntəɹi/
✓ Added translation: "complimentary" -> miễn phí

✅ Finished fetching all pronunciations
```

## Performance

### With Translation:
- **10 words**: ~3-4 seconds (parallel fetch)
- **20 words**: ~5-6 seconds
- **Each word**: 2 API calls (pronunciation + translation) in parallel

### Optimization:
- ✅ In-memory cache reduces repeat requests
- ✅ Promise.all enables parallel fetching
- ✅ Only fetch for visible words (lazy loading)
- ✅ Rate limiting protection with cache

## Rate Limiting

### MyMemory API Limits:
- **Anonymous**: 1000 requests/day
- **With email**: 10,000 requests/day

### Our Usage:
- Average episode: ~10 words
- Average user: ~5 episodes/session
- Total: ~50 requests/session
- Daily limit: 1000 / 50 = **20 users/day** (anonymous)

### Solution for Production:
1. Add email parameter to API calls (10x limit)
2. Implement backend caching (reduce API calls)
3. Use fallback APIs when limit reached
4. Pre-translate common words in database

## Code Example

```javascript
// Fetch both in parallel
const [pronunciation, translation] = await Promise.all([
  fetchPronunciation('grab'),
  fetchVietnameseTranslation('grab')
])

// Result:
// pronunciation: 'ɡræb'
// translation: 'lấy nhanh, nắm'
```

## CSS Styling

```css
.transcript-content .definition .translation {
  @apply text-sm italic text-indigo-600 dark:text-indigo-400 font-medium;
}
```

## User Experience

### Timeline:
1. User clicks "Show" → 0ms
2. Fetch HTML → ~200ms
3. Fetch IPA + Translation (parallel) → ~2-3s
4. Display results progressively → Real-time
5. All done ✓

### Visual Feedback:
- Loading spinner with progress
- "Fetching pronunciations & translations..."
- "5 / 10 words (IPA + 🇻🇳 Vietnamese)"
- Progress percentage

### Result:
- Natural, seamless experience
- User không cần làm gì thêm
- Translation tự động xuất hiện
- Màu sắc phân biệt rõ ràng

## Testing

Test với các loại từ:
- ✅ Common words: "grab", "go", "big"
- ✅ Phrases: "go with", "big deal"
- ✅ Adjectives: "complimentary", "casual"
- ✅ Verbs: "recommend", "working"
- ✅ Rare words: fallback to "(no translation)"
