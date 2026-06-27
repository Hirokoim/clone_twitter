/**
 * ============================================================
 * OAuth コールバックページ
 * ============================================================
 * 
 * Google ログイン後、Supabase がこのページにリダイレクト
 * URL からセッション情報を抽出し、ダッシュボードに進む
 * 
 * URL: /auth/callback
 * 例：/auth/callback?code=xxxxx&state=xxxxx
 */

'use client'; // Next.js App Router で React を使う

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * 【AuthCallbackPage コンポーネント】
 * 
 * Google ログイン後、自動的にこのページに遷移します。
 * 
 * フロー：
 * 1. ページロード時、Supabase が URL のパラメータを処理
 * 2. セッション情報が自動的に保存される
 * 3. getSession() でセッションを確認
 * 4. ログイン成功 → ダッシュボードにリダイレクト
 * 5. ログイン失敗 → ログインページにリダイレクト
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  /**
   * 【ライフサイクル】
   * 
   * ページロード時に1回だけ実行
   */
  useEffect(() => {
    handleCallback();
  }, []);

  /**
   * 【コールバック処理】
   * 
   * ステップ：
   * 1. supabase.auth.getSession() でセッション取得
   * 2. セッションが存在 → ダッシュボードへ
   * 3. セッションが存在しない → ログインページへ
   */
  const handleCallback = async () => {
    try {
      // 【重要】Supabase が URL のパラメータを処理済み
      // getSession() でセッション情報を取得
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('セッション取得エラー:', error);
        throw error;
      }

      if (session) {
        // ✅ ログイン成功
        // ユーザー情報がセッションに含まれている
        console.log('ログイン成功:', session.user.email);

        // ダッシュボード（ホームページ）にリダイレクト
        // 少し遅延させて、UI が更新されるのを待つ
        setTimeout(() => {
          router.push('/');
        }, 500);
      } else {
        // ❌ ログイン失敗
        console.warn('セッションが見つかりません');

        // ログインページにリダイレクト
        setTimeout(() => {
          router.push('/login');
        }, 500);
      }
    } catch (err) {
      console.error('コールバック処理エラー:', err);

      // エラーの場合もログインページへ
      setTimeout(() => {
        router.push('/login');
      }, 500);
    }
  };

  /**
   * 【UI】
   * 
   * ローディング中の表示
   * ページロード → リダイレクト が素早く行われるため、
   * 一瞬だけこの UI が表示される
   */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#F9FAFB',
        gap: '16px',
      }}
    >
      {/* ローディングスピナー */}
      <div
        style={{
          width: '40px',
          height: '40px',
          border: '4px solid #E5E7EB',
          borderTop: '4px solid #3B82F6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />

      {/* メッセージ */}
      <p style={{ fontSize: '16px', color: '#6B7280', margin: '0' }}>
        ログイン処理中...
      </p>

      {/* CSS アニメーション */}
      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * 【Supabase の自動処理について】
 * 
 * Google OAuth ログイン後、以下が自動的に行われます：
 * 
 * 1. Google から Supabase にユーザー情報が送られる
 * 2. Supabase が auth.users テーブルにユーザーを作成
 * 3. トークンと共に /auth/callback?code=xxx にリダイレクト
 * 4. Supabase JS SDK が URL のパラメータを処理
 * 5. セッションをローカルストレージに保存
 * 
 * つまり、このページに到達した時点で、
 * セッション処理はほぼ完了しています！
 */

/**
 * 【useRouter について】
 * 
 * Next.js 13+ では、ページ内遷移に useRouter を使用
 * 
 * import { useRouter } from 'next/navigation';
 *           ↑
 * 重要：'next/app-router' ではなく 'next/navigation'
 * （ページ router の場合は 'next/router'）
 */

/**
 * 【セッション自動復元】
 * 
 * app/layout.tsx など他のページでも
 * supabase.auth.onAuthStateChange() が常に
 * セッション変化を監視しているため、
 * このページでリダイレクトすると、
 * 他のページの useAuthState も自動的に更新されます。
 */