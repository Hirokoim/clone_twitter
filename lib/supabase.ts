/**
 * ============================================================
 * Supabase クライアント初期化
 * ============================================================
 * 
 * このファイルは Supabase への接続を管理します。
 * 環境変数から URL と API キーを取得して、
 * Supabase クライアントを初期化・エクスポートします。
 */

import { createClient } from '@supabase/supabase-js';

/**
 * 【環境変数の取得】
 * 
 * Next.js では NEXT_PUBLIC_ で始まる環境変数は
 * ブラウザ側でも使用可能です。
 * 
 * .env.local から自動的に読み込まれます：
 * NEXT_PUBLIC_SUPABASE_URL=https://...
 * NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 【環境変数の検証】
 * 
 * もし環境変数が設定されていなかったらエラーを表示
 * これにより開発時のバグをすぐに発見できます
 */
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase 環境変数が設定されていません。\n' +
    '.env.local に以下を追加してください：\n' +
    'NEXT_PUBLIC_SUPABASE_URL=https://...\n' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...'
  );
}

/**
 * 【Supabase クライアント作成】
 * 
 * createClient() で Supabase への接続を初期化
 * このクライアントを使って、以下が可能：
 * - supabase.auth.signInWithOAuth()：OAuth ログイン
 * - supabase.auth.getSession()：セッション取得
 * - supabase.from('table_name').select()：データ取得
 * - supabase.from('table_name').insert()：データ挿入
 */
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    /**
     * 【Auth 設定】
     * 
     * persistSession: true
     * → ログイン状態をローカルストレージに保存
     *   ページリロード後も自動的にログイン状態が維持される
     * 
     * autoRefreshToken: true
     * → セッショントークンの自動更新
     *   トークン期限切れ前に自動的に新しいトークンを取得
     * 
     * detectSessionInUrl: true
     * → OAuth ログイン後のコールバック URL でセッションを検出
     *   /auth/callback ページで自動的にセッションを処理
     */
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);

/**
 * 【使用例】
 * 
 * // ログイン状態の監視
 * const { data: { session } } = await supabase.auth.getSession();
 * 
 * // Google でログイン
 * await supabase.auth.signInWithOAuth({
 *   provider: 'google',
 *   options: { redirectTo: window.location.origin + '/auth/callback' }
 * });
 * 
 * // プロフィール取得
 * const { data, error } = await supabase
 *   .from('profiles')
 *   .select('*')
 *   .eq('id', userId)
 *   .single();
 * 
 * // ツイート投稿
 * await supabase
 *   .from('tweets')
 *   .insert([{ content: '...', user_id: userId }]);
 */