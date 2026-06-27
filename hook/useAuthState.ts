/**
 * ============================================================
 * Google ログインボタンコンポーネント
 * ============================================================
 * 
 * ユーザーが「Google でログイン」をクリックすると、
 * Google OAuth ログイン画面にリダイレクトします。
 */

'use client'; // Next.js App Router で React コンポーネントを使う

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * 【GoogleLoginButton コンポーネント】
 * 
 * 機能：
 * - Google OAuth ログイン開始
 * - ローディング状態管理
 * - エラーハンドリング
 * - ユーザーフレンドリーな UI
 */
export const GoogleLoginButton: React.FC = () => {
  // 【状態管理】
  const [loading, setLoading] = useState(false);          // ローディング中？
  const [error, setError] = useState<string | null>(null); // エラーメッセージ

  /**
   * 【Google ログイン処理】
   * 
   * ステップ：
   * 1. supabase.auth.signInWithOAuth() を呼び出し
   * 2. Google OAuth 認可画面にリダイレクト
   * 3. ユーザーが Google アカウントでログイン
   * 4. Google が Supabase にユーザー情報を返す
   * 5. Supabase が auth.users テーブルに自動作成
   * 6. /auth/callback にリダイレクト
   */
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // 【重要】Google OAuth ログイン開始
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // ログイン成功後にリダイレクトするページ
          redirectTo: `${window.location.origin}/auth/callback`,
          
          // スコープ（オプション）
          // 取得する情報の種類を指定
          // デフォルト：openid profile email
          scopes: 'openid profile email',
          
          // クエリパラメータ（オプション）
          queryParams: {
            // アクセスタイプ：オフラインで後でトークンを使える
            access_type: 'offline',
            // ユーザーにアカウント選択を強制
            prompt: 'consent',
          },
        },
      });

      if (error) {
        throw error;
      }

      // error がなければ、自動的に Google ログイン画面にリダイレクト
      // ここに到達することはない（リダイレクト前に処理が止まる）
    } catch (err) {
      // エラー処理
      const errorMessage = err instanceof Error 
        ? err.message 
        : '不明なエラーが発生しました';
      
      setError(errorMessage);
      console.error('Google ログインエラー:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ログインボタン */}
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: '500',
          backgroundColor: '#1F2937',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            (e.target as HTMLButtonElement).style.backgroundColor = '#111827';
          }
        }}
        onMouseLeave={(e) => {
          if (!loading) {
            (e.target as HTMLButtonElement).style.backgroundColor = '#1F2937';
          }
        }}
      >
        {/* Google アイコン（SVG） */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          style={{ flexShrink: 0 }}
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>

        {/* ボタンテキスト */}
        {loading ? 'ログイン中...' : 'Google でログイン'}
      </button>

      {/* エラーメッセージ表示 */}
      {error && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#FEE2E2',
            color: '#991B1B',
            borderRadius: '8px',
            fontSize: '14px',
            borderLeft: '4px solid #DC2626',
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* 情報メッセージ */}
      <p
        style={{
          fontSize: '12px',
          color: '#6B7280',
          margin: '0',
          textAlign: 'center',
        }}
      >
        このボタンをクリックすると、Google ログイン画面にリダイレクトします。
      </p>
    </div>
  );
};

/**
 * 【使用例】
 * 
 * pages/login.tsx:
 * 
 * import { GoogleLoginButton } from '@/components/GoogleLoginButton';
 * 
 * export default function LoginPage() {
 *   return (
 *     <div>
 *       <h1>ログイン</h1>
 *       <GoogleLoginButton />
 *     </div>
 *   );
 * }
 */

/**
 * 【フロー図】
 * 
 * ユーザーが「Google でログイン」をクリック
 *          ↓
 * supabase.auth.signInWithOAuth({ provider: 'google' })
 *          ↓
 * Google OAuth 認可画面にリダイレクト
 *          ↓
 * ユーザーが Google アカウントでサインイン
 *          ↓
 * Google が Supabase にユーザー情報を返す
 *          ↓
 * Supabase が auth.users テーブルに自動作成
 *          ↓
 * /auth/callback にリダイレクト
 *          ↓
 * useAuth フックが onAuthStateChange を検出
 *          ↓
 * ログイン状態を更新 → コンポーネント再レンダリング
 */