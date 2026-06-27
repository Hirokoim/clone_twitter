'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface Tweet {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
}

interface UserProfile {
  id: string;
  handle: string;
  display_name: string;
  is_private: boolean;
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [tweetInput, setTweetInput] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // ユーザー情報と認証状態の確認
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ツイート一覧の読み込み＆リアルタイム購読
  useEffect(() => {
    if (!user) return;

    // 初回読み込み
    loadTweets();
    loadFollowing();

    // リアルタイム購読
    const subscription = supabase
      .channel('tweets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tweets' },
        () => loadTweets()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  // フォロー中のユーザーを読み込む
  const loadFollowing = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      if (error) throw error;
      setFollowingIds(new Set(data.map((f) => f.following_id)));
    } catch (error) {
      console.error('フォロー情報読み込みエラー:', error);
    }
  };

  // ツイート一覧を読み込む（RLS が権限を自動制御）
  const loadTweets = async () => {
    try {
      const { data, error } = await supabase
        .from('tweets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTweets(data || []);

      // ツイートに含まれるユーザーのプロフィール情報を取得
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((t) => t.user_id))];
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        const profileMap = new Map<string, UserProfile>();
        profilesData?.forEach((profile) => {
          profileMap.set(profile.id, profile);
        });
        setProfiles(profileMap);
      }
    } catch (error) {
      console.error('ツイート読み込みエラー:', error);
    }
  };

  // ツイートを投稿
  const handlePost = async () => {
    if (!user || !tweetInput.trim()) return;

    setIsPosting(true);
    try {
      const { error } = await supabase.from('tweets').insert({
        user_id: user.id,
        content: tweetInput.trim(),
        is_public: true,
      });

      if (error) throw error;

      setTweetInput('');
      await loadTweets();
    } catch (error) {
      console.error('投稿エラー:', error);
      alert('投稿に失敗しました');
    } finally {
      setIsPosting(false);
    }
  };

  // ツイートを削除
  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;

    try {
      const { error } = await supabase.from('tweets').delete().eq('id', id);
      if (error) throw error;
      await loadTweets();
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  // ツイートを編集
  const handleEdit = (id: string, content: string) => {
    setEditingId(id);
    setEditingContent(content);
  };

  // 編集を保存
  const handleSaveEdit = async (id: string) => {
    if (!editingContent.trim()) {
      alert('ツイート内容を入力してください');
      return;
    }

    try {
      const { error } = await supabase
        .from('tweets')
        .update({ content: editingContent.trim() })
        .eq('id', id);

      if (error) throw error;

      setEditingId(null);
      setEditingContent('');
      await loadTweets();
    } catch (error) {
      console.error('編集エラー:', error);
      alert('編集に失敗しました');
    }
  };

  // 編集をキャンセル
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  // フォロー処理
  const handleFollow = async (followeeId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: followeeId });

      if (error) throw error;

      setFollowingIds(new Set([...followingIds, followeeId]));
    } catch (error) {
      console.error('フォローエラー:', error);
      alert('フォローに失敗しました');
    }
  };

  // アンフォロー処理
  const handleUnfollow = async (followeeId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', followeeId);

      if (error) throw error;

      const newFollowingIds = new Set(followingIds);
      newFollowingIds.delete(followeeId);
      setFollowingIds(newFollowingIds);
    } catch (error) {
      console.error('アンフォローエラー:', error);
      alert('アンフォローに失敗しました');
    }
  };

  // ログアウト
  const handleLogout = async () => {
    await supabase.auth.signOut();
    // ブラウザのローカルストレージをクリア（共有PCでのデータ漏洩防止）
    localStorage.clear();
    // ページをリロードして確実にクリア
    window.location.href = '/';
  };

  // 投稿時間を相対表示（●分前、●時間前、日付）
  const formatRelativeTime = (createdAt: string): string => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMinutes < 60) {
      return `${diffMinutes}分前`;
    } else if (diffHours < 24) {
      return `${diffHours}時間前`;
    } else {
      const year = created.getFullYear();
      const month = String(created.getMonth() + 1).padStart(2, '0');
      const date = String(created.getDate()).padStart(2, '0');
      return `${year}年${month}月${date}日`;
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  // ログアウト状態：ログイン画面
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-6xl font-black text-blue-400 mb-4">𝕏</h1>
          <h2 className="text-4xl font-bold mb-4">今起きていることを知ろう</h2>
          <p className="text-gray-600 text-lg mb-8">
            Twitter Clone に参加しましょう
          </p>

          <button
            onClick={async () => {
              await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + '/auth/callback' },
              });
            }}
            className="w-full rounded-full bg-blue-500 px-8 py-3 text-white font-bold text-lg hover:bg-blue-600 mb-4"
          >
            Googleでログイン
          </button>

          <p className="text-sm text-gray-500">
            🔒 Google 認証で安全にログインできます
          </p>
        </div>
      </div>
    );
  }

  // ログイン状態：ホームタイムライン
  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー */}
      <div className="border-b border-gray-200 sticky top-0 bg-white bg-opacity-80 backdrop-blur z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">ホーム</h1>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/profile/me')}
              className="text-sm text-blue-500 hover:text-blue-600 font-bold"
            >
              👤 マイプロフィール
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-blue-500 font-bold"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* ツイート投稿エリア */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <textarea
                value={tweetInput}
                onChange={(e) => setTweetInput(e.target.value)}
                placeholder="いま、何してる？"
                maxLength={280}
                className="w-full text-xl placeholder-gray-500 outline-none resize-none"
                rows={4}
              />
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-500">
                  {tweetInput.length}/280
                </span>
                <button
                  onClick={handlePost}
                  disabled={!tweetInput.trim() || isPosting || tweetInput.length > 280}
                  className="rounded-full bg-blue-500 px-6 py-2 text-white font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPosting ? 'ポスト中...' : 'ポスト'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ツイート一覧 */}
        <div className="divide-y divide-gray-200">
          {tweets.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              ツイートがありません
            </div>
          ) : (
            tweets.map((tweet) => (
              <div
                key={tweet.id}
                className="p-4 hover:bg-gray-50 transition border-b border-gray-200 last:border-b-0"
              >
                {editingId === tweet.id ? (
                  // 編集モード
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => router.push(`/profile/${tweet.user_id}`)}
                          className="font-bold hover:underline text-left"
                        >
                          @{tweet.user_id.slice(0, 8)}
                        </button>
                      </div>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        maxLength={280}
                        className="w-full p-2 border border-blue-500 rounded text-gray-900 resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleSaveEdit(tweet.id)}
                          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-bold"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400 text-sm font-bold"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // 表示モード
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(`/profile/${tweet.user_id}`)}
                            className="font-bold hover:underline"
                          >
                            {profiles.get(tweet.user_id)?.display_name || 'ユーザー'}
                          </button>
                          {followingIds.has(tweet.user_id) && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">
                              フォロー中
                            </span>
                          )}
                          <span className="text-gray-500 text-sm">
                            {formatRelativeTime(tweet.created_at)}
                          </span>
                        </div>
                      </div>
                      <p className="text-gray-900 mt-2 break-words whitespace-pre-wrap">
                        {tweet.content}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}