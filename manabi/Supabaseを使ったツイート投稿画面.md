# Supabaseを使ったツイート投稿画面の実装ガイド

このガイドでは、フロントエンド（ブラウザ）とSupabase（バックエンド・DB）の役割分担を明確にしながら、シンプルなツイート投稿機能を実装します。

---

## 📋 全体構成図

```
┌─────────────────────────────────┐
│   ブラウザ（フロントエンド）      │
│  ┌──────────────────────────┐   │
│  │ React コンポーネント      │   │
│  │ - テキスト入力フィールド   │   │
│  │ - 投稿ボタン              │   │
│  │ - ツイート一覧表示  　　   │   │
│  └──────────────────────────┘   │
│              ↕                  │
│   HTTP リクエスト/レスポンス      │
│              ↕                  │
└─────────────────────────────────┘
          インターネット
┌─────────────────────────────────┐
│  Supabase（バックエンド・DB）     │
│  ┌──────────────────────────┐   │
│  │ PostgreSQL データベース   │   │
│  │ ┌────────────────────┐   │   │
│  │ │ tweets テーブル    │    │   │
│  │ │ - id (自動採番)    │    │   │
│  │ │ - content (文章)   │    │   │
│  │ │ - created_at (日時)│ 　 │   │
│  │ └────────────────────┘   │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ REST API (自動生成)       │   │
│  │ - POST /tweets           │   │
│  │ - GET /tweets            │   │
│  │ - RLS (セキュリティ)      │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

---

## 🎨 フロントエンド側の実装

### 必要な環境セットアップ

```bash
# Node.js プロジェクト初期化
npm init -y

# Supabase JavaScript クライアントライブラリをインストール
npm install @supabase/supabase-js
```

### React コンポーネント実装例

```typescript
// TweetComposer.tsx
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 【重要】Supabase プロジェクト情報を環境変数で管理
// .env.local に以下を設定してください
// REACT_APP_SUPABASE_URL=https://your-project.supabase.co
// REACT_APP_SUPABASE_ANON_KEY=your-anon-key
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL!,
  process.env.REACT_APP_SUPABASE_ANON_KEY!
);

interface Tweet {
  id: number;
  content: string;
  created_at: string;
}

export const TweetComposer: React.FC = () => {
  const [tweetText, setTweetText] = useState('');
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // コンポーネント初期化時に既存ツイートを読み込み
  useEffect(() => {
    loadTweets();
  }, []);

  // 【フロントエンド側】
  // Supabase から tweets テーブルの全データを取得
  // GET リクエストで最新順に10件取得
  const loadTweets = async () => {
    try {
      const { data, error } = await supabase
        .from('tweets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setTweets(data || []);
    } catch (err) {
      console.error('ツイート取得エラー:', err);
      setError('ツイートの読み込みに失敗しました');
    }
  };

  // 【フロントエンド側】
  // ツイートを Supabase に送信（POST）
  // tweets テーブルに新しい行を挿入
  const handlePostTweet = async () => {
    const text = tweetText.trim();
    
    // バリデーション
    if (!text) {
      setError('ツイートを入力してください');
      return;
    }

    if (text.length > 280) {
      setError('280文字以内で入力してください');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Supabase の tweets テーブルに新しい行を挿入
      // content：ツイート本文
      // created_at：作成日時（自動的に現在時刻を設定）
      const { error } = await supabase
        .from('tweets')
        .insert([
          {
            content: text,
            created_at: new Date().toISOString(),
          },
        ]);

      if (error) throw error;

      // 投稿成功後、入力欄をクリア
      setTweetText('');
      
      // ツイート一覧を更新
      await loadTweets();
    } catch (err) {
      console.error('投稿エラー:', err);
      setError('ツイートの投稿に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 文字数をカウント（280文字制限）
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (text.length <= 280) {
      setTweetText(text);
      setError(null);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>ツイート投稿</h1>

      {/* 投稿フォーム */}
      <textarea
        value={tweetText}
        onChange={handleTextChange}
        placeholder="今何してる？"
        maxLength={280}
        style={{
          width: '100%',
          minHeight: '100px',
          padding: '10px',
          fontSize: '16px',
          border: '1px solid #ccc',
          borderRadius: '8px',
        }}
      />

      {/* 文字数表示 */}
      <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
        {tweetText.length}/280
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div style={{ color: '#d32f2f', marginTop: '10px' }}>
          {error}
        </div>
      )}

      {/* 投稿ボタン */}
      <button
        onClick={handlePostTweet}
        disabled={loading}
        style={{
          marginTop: '10px',
          padding: '10px 20px',
          backgroundColor: '#1DA1F2',
          color: 'white',
          border: 'none',
          borderRadius: '20px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '投稿中...' : '投稿'}
      </button>

      {/* ツイート一覧 */}
      <div style={{ marginTop: '30px' }}>
        <h2>最新のツイート</h2>
        {tweets.length === 0 ? (
          <p style={{ color: '#999' }}>ツイートがまだありません</p>
        ) : (
          tweets.map((tweet) => (
            <div
              key={tweet.id}
              style={{
                padding: '15px',
                border: '1px solid #eee',
                borderRadius: '8px',
                marginBottom: '10px',
              }}
            >
              <p style={{ margin: '0 0 8px' }}>{tweet.content}</p>
              <p style={{ margin: '0', fontSize: '12px', color: '#999' }}>
                {new Date(tweet.created_at).toLocaleString('ja-JP')}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
```

---

## 🚀 Supabase（バックエンド・DB）側の設定

### 1. Supabaseプロジェクトの作成

1. [supabase.com](https://supabase.com) にアクセス
2. 「新規プロジェクト」を作成
3. プロジェクト名（例：`tweet-app`）とパスワードを設定
4. リージョンを選択（日本は `ap-northeast-1` または `ap-southeast-1`）
5. 「新規プロジェクトを作成」をクリック

### 2. tweets テーブルの作成

Supabase ダッシュボードの「SQL エディタ」で以下を実行：

```sql
-- 【Supabase側】
-- tweets テーブルを作成
-- PostgreSQL のテーブル定義です
CREATE TABLE tweets (
  -- id: 自動採番される主キー
  -- type: bigint（大きな整数）
  id bigint primary key generated always as identity,
  
  -- content: ツイートの本文
  -- type: text（テキスト型、最大長なし）
  -- NOT NULL: 必須項目
  content text NOT NULL,
  
  -- created_at: 作成日時
  -- type: timestamp（日時型）
  -- default now(): 現在時刻を自動的に設定
  created_at timestamp default now(),
  
  -- updated_at: 更新日時（後で使うかもしれないので追加）
  updated_at timestamp default now()
);

-- インデックスを作成してクエリ性能を向上
-- created_at の新しい順でよく検索されるので
CREATE INDEX tweets_created_at_desc ON tweets(created_at DESC);

-- tweets テーブルに変更がされたら、自動的に updated_at を更新するトリガーを作成
CREATE OR REPLACE FUNCTION update_tweet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tweets_timestamp_trigger
BEFORE UPDATE ON tweets
FOR EACH ROW
EXECUTE FUNCTION update_tweet_timestamp();
```

### 3. RLS（Row Level Security）の設定

セキュリティを確保するため、行レベルセキュリティを有効化します。

```sql
-- 【Supabase側】
-- RLSを有効化
-- これにより、ルールを定義しない限り、誰もテーブルにアクセスできなくなります
ALTER TABLE tweets ENABLE ROW LEVEL SECURITY;

-- 【ポリシー】誰でもツイートを読むことができる（SELECT許可）
CREATE POLICY "允许任何人读取推文" ON tweets
  FOR SELECT
  USING (true);

-- 【ポリシー】誰でもツイートを投稿できる（INSERT許可）
-- 注意：本番環境では、認証ユーザーのみに限定する必要があります
-- user_id カラムを追加して、作成者のみ削除可能にするのがベストプラクティス
CREATE POLICY "允许任何人插入推文" ON tweets
  FOR INSERT
  WITH CHECK (true);

-- 【将来の改善】
-- user_id カラムを追加して、個人のツイートのみ削除・更新可能にしたい場合：
-- CREATE POLICY "只有作者可以删除自己的推文" ON tweets
--   FOR DELETE
--   USING (auth.uid() = user_id);
```

### 4. REST APIの自動生成確認

Supabase は PostgreSQL テーブルから自動的に REST API を生成します。

生成されるエンドポイント：
```
POST   https://your-project.supabase.co/rest/v1/tweets      # 新規ツイート投稿
GET    https://your-project.supabase.co/rest/v1/tweets      # ツイート一覧取得
GET    https://your-project.supabase.co/rest/v1/tweets?id=1 # 特定ツイート取得
PATCH  https://your-project.supabase.co/rest/v1/tweets?id=1 # ツイート編集
DELETE https://your-project.supabase.co/rest/v1/tweets?id=1 # ツイート削除
```

---

## 🔑 認証情報の取得

1. Supabase ダッシュボード → 「Project Settings」
2. 「API」タブをクリック
3. 以下をコピー：
   - **Project URL**: `https://your-project.supabase.co`
   - **anon public key**: `eyJhbGc...`（始まる長い文字列）

これらを `.env.local` に設定：
```
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGc...
```

---

## 📊 tweets テーブルのスキーマ

| カラム名 | 型 | 説明 |
|---------|-----|------|
| `id` | bigint | 自動採番される主キー |
| `content` | text | ツイートの本文（最大280文字） |
| `created_at` | timestamp | 作成日時（自動設定） |
| `updated_at` | timestamp | 更新日時（自動設定） |

---

## 🔄 フロントエンド・バックエンド間の通信フロー

### ツイート投稿の流れ

```
1. ユーザーがツイートを入力 → textarea に保存
   [フロントエンド]

2. 「投稿」ボタンをクリック
   [フロントエンド]

3. POST リクエストを送信
   POST /rest/v1/tweets
   {
     "content": "Hello World!",
     "created_at": "2024-01-15T10:30:00Z"
   }
   [ネットワーク通信]

4. Supabase が tweets テーブルに新しい行を INSERT
   [バックエンド・DB側]

5. JSON レスポンスを返す
   {
     "id": 1,
     "content": "Hello World!",
     "created_at": "2024-01-15T10:30:00Z",
     "updated_at": "2024-01-15T10:30:00Z"
   }
   [ネットワーク通信]

6. 一覧を再取得して表示を更新
   [フロントエンド]
```

### ツイート一覧取得の流れ

```
1. ページロード時に GET リクエスト
   GET /rest/v1/tweets?order=created_at.desc&limit=10
   [フロントエンド]

2. Supabase が tweets テーブルから最新10件を SELECT
   [バックエンド・DB側]

3. JSON 配列を返す
   [
     { "id": 3, "content": "3番目", ... },
     { "id": 2, "content": "2番目", ... },
     { "id": 1, "content": "1番目", ... }
   ]
   [ネットワーク通信]

4. フロントエンドが受け取ったデータを表示
   [フロントエンド]
```

---

## 🛡️ セキュリティのベストプラクティス

1. **API キーの保護**
   - `anon key` と `service role key` を区別する
   - `.env` ファイルは Git にコミットしない
   - フロントエンドでは `anon key` のみ使用

2. **RLS（行レベルセキュリティ）**
   - 必ず `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` を実行
   - ポリシーを設定して、許可したアクションのみ許可

3. **認証ユーザー限定**
   ```sql
   -- 改善例：認証ユーザーのみ投稿可能
   CREATE POLICY "only_authenticated_users_can_insert" ON tweets
     FOR INSERT
     WITH CHECK (auth.role() = 'authenticated');
   ```

4. **本番環境の推奨設定**
   - ツイートに `user_id` カラムを追加
   - 削除・編集は作成者のみ許可
   - レート制限を実装

---

## 🐛 トラブルシューティング

### エラー："403 Forbidden"
- **原因**: RLS ポリシーが正しく設定されていない
- **対処**: RLS ポリシーを確認し、INSERT/SELECT ポリシーが有効か確認

### エラー："CORS エラー"
- **原因**: ブラウザのCross-Origin制限
- **対処**: Supabase ダッシュボード → "Project Settings" → "API" → "CORS" で、フロントエンドのドメインを許可

### データが保存されない
- **原因**: RLS ポリシーが INSERT を許可していない
- **対処**: `CREATE POLICY ... FOR INSERT WITH CHECK (true)` で全員許可を試す

---

## 📚 さらに学習するために

- [Supabase 公式ドキュメント](https://supabase.com/docs)
- [Supabase JavaScript クライアント](https://supabase.com/docs/reference/javascript)
- [PostgreSQL チュートリアル](https://www.postgresql.org/docs/current/tutorial.html)
- [REST API 基礎](https://restfulapi.net/)

---

**このガイドで、フロントエンド（ブラウザのUI）とバックエンド（Supabaseのデータベース）の役割が明確になったはずです！**
