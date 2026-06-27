'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { Heart, MessageCircle, Repeat2 } from 'lucide-react';

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
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
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
        .select('followee_id')
        .eq('follower_id', user.id);

      if (error) throw error;
      setFollowingIds(new Set(data.map((f) => f.followee_id)));
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
        .insert({ follower_id: user.id, followee_id: followeeId });

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
        .eq('followee_id', followeeId);

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
      <div className="flex h-screen items-center justify-center bg-teal-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
          <p className="mt-4 text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  // ログアウト状態：ログイン画面
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-50">
        <div className="max-w-sm w-full text-center px-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 mx-auto mb-6 flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C7.6 2 4 5.3 4 9.4c0 2.7 1.4 5.1 3.6 6.6L12 22l4.4-6c2.2-1.5 3.6-3.9 3.6-6.6C20 5.3 16.4 2 12 2zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/>
            </svg>
          </div>
          <h1 className="text-5xl font-black bg-gradient-to-r from-cyan-400 to-emerald-500 bg-clip-text text-transparent mb-4">cloneX</h1>
          <h2 className="text-3xl font-bold text-gray-800 mb-3">今起きていることを知ろう</h2>
          <p className="text-gray-600 text-lg mb-8">
            cloneX に参加しましょう
          </p>

          <button
            onClick={async () => {
              await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + '/auth/callback' },
              });
            }}
            className="w-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-500 px-8 py-3 text-white font-bold text-lg hover:-translate-y-0.5 shadow-md hover:shadow-lg transition-all duration-200 mb-4"
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
    <div className="min-h-screen bg-teal-50 flex">
      {/* ============ LEFT SIDEBAR ============ */}
      <aside className="w-56 h-screen sticky top-0 bg-white border-r border-gray-200 flex flex-col gap-2 px-3 py-4 flex-shrink-0 z-10">
        {/* Logo */}
        <div className="px-3 py-1.5 mb-4">
          <div className="inline-flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center shadow-sm">
              <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C7.6 2 4 5.3 4 9.4c0 2.7 1.4 5.1 3.6 6.6L12 22l4.4-6c2.2-1.5 3.6-3.9 3.6-6.6C20 5.3 16.4 2 12 2zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/>
              </svg>
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-emerald-500 bg-clip-text text-transparent">cloneX</span>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="space-y-1 flex-1">
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-gray-800 font-medium text-[15px] hover:bg-cyan-50 transition-all duration-150"
          >
            <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
            <span>ホーム</span>
          </button>
          <button
            onClick={() => router.push('/profile/me')}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-gray-800 hover:bg-cyan-50 transition-all duration-150 font-medium text-[15px]"
          >
            <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
            <span>プロフィール</span>
          </button>
        </nav>

        {/* Spacer */}
        <div className="flex-1"></div>

        {/* Post Button */}
        <button
          onClick={() => setIsPostModalOpen(true)}
          className="w-full py-3 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-500 text-white font-semibold text-[15px] hover:-translate-y-0.5 shadow-md hover:shadow-lg transition-all duration-200 mb-2"
        >
          ✦ つぶやく
        </button>

        {/* User Chip */}
        <div className="flex items-center gap-2.5 px-3 py-3 rounded-2xl hover:bg-teal-50 transition-colors group">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm overflow-hidden">
            {profiles.get(user.id)?.avatar_url ? (
              <img src={profiles.get(user.id)?.avatar_url} alt="avatar" className="w-full h-full object-contain" />
            ) : (
              user.email?.[0].toUpperCase()
            )}
          </div>
          <div className="text-left flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">
              {profiles.get(user.id)?.display_name || user.email?.split('@')[0] || 'ユーザー'}
            </div>
            <div className="text-xs text-gray-500 truncate">
              @{profiles.get(user.id)?.handle || user.email?.split('@')[0]}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
            title="ログアウト"
          >
            🚪
          </button>
        </div>
      </aside>

      {/* ============ MAIN CONTENT ============ */}
      <main className="flex-1 bg-white border-r border-gray-200 min-h-screen overflow-y-auto max-w-xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-gray-200 px-5 py-3.5">
          <h2 className="m-0 text-[17px] font-bold text-gray-800 tracking-tight">ホーム</h2>
        </div>

      {/* ツイート投稿モーダル */}
      {isPostModalOpen && (
        <div className="fixed inset-0 bg-transparent flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">つぶやきを投稿</h2>
              <button
                onClick={() => setIsPostModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition text-xl"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-4">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-sm overflow-hidden">
                {profiles.get(user.id)?.avatar_url ? (
                  <img src={profiles.get(user.id)?.avatar_url} alt="avatar" className="w-full h-full object-contain" />
                ) : (
                  user.email?.[0].toUpperCase()
                )}
              </div>
              <div className="flex-1">
                <textarea
                  value={tweetInput}
                  onChange={(e) => setTweetInput(e.target.value)}
                  placeholder="今どうしてる？"
                  maxLength={280}
                  className="w-full text-base placeholder-gray-400 outline-none resize-none bg-transparent p-0 text-gray-700 font-normal"
                  rows={4}
                  autoFocus
                  style={{ fontFamily: 'Inter, sans-serif' }}
                />
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                  <span className="text-sm text-gray-500 font-medium">
                    {tweetInput.length}/280
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsPostModalOpen(false);
                        setTweetInput('');
                      }}
                      className="px-5 py-2 text-gray-700 font-semibold hover:bg-gray-50 rounded-full text-sm transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={async () => {
                        await handlePost();
                        setIsPostModalOpen(false);
                      }}
                      disabled={!tweetInput.trim() || isPosting || tweetInput.length > 280}
                      className="rounded-full bg-gradient-to-r from-cyan-400 to-emerald-500 px-6 py-2 text-white font-semibold hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm"
                    >
                      {isPosting ? '投稿中...' : 'つぶやく'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* ツイート一覧 */}
        <div className="divide-y divide-gray-100">
          {tweets.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-[15px]">
              ツイートがありません
            </div>
          ) : (
            tweets.map((tweet) => (
              <div
                key={tweet.id}
                className="px-5 py-4 hover:bg-cyan-50/40 transition-colors duration-150 border-b border-gray-100 last:border-b-0 cursor-pointer"
              >
                {editingId === tweet.id ? (
                  // 編集モード
                  <div className="flex gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => router.push(`/profile/${tweet.user_id}`)}
                          className="font-semibold text-gray-800 hover:underline text-left text-sm"
                        >
                          {profiles.get(tweet.user_id)?.display_name || 'ユーザー'}
                        </button>
                      </div>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        maxLength={280}
                        className="w-full p-2 border border-cyan-400 rounded text-gray-800 resize-none text-[15px]"
                        rows={3}
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleSaveEdit(tweet.id)}
                          className="px-4 py-1.5 bg-gradient-to-r from-cyan-400 to-emerald-500 text-white rounded-full hover:shadow-md text-xs font-semibold transition-all"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 text-xs font-semibold transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // 表示モード
                  <div className="flex gap-3">
                    <button
                      onClick={() => router.push(`/profile/${tweet.user_id}`)}
                      className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                    >
                      {profiles.get(tweet.user_id)?.avatar_url ? (
                        <img src={profiles.get(tweet.user_id)?.avatar_url} alt="avatar" className="w-full h-full object-contain" />
                      ) : (
                        tweet.user_id.slice(0, 1).toUpperCase()
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 mb-1 flex-wrap">
                        <button
                          onClick={() => router.push(`/profile/${tweet.user_id}`)}
                          className="font-semibold text-gray-800 hover:underline text-[14px]"
                        >
                          {profiles.get(tweet.user_id)?.display_name || 'ユーザー'}
                        </button>
                        <span className="text-gray-500 text-[13px]">
                          @{profiles.get(tweet.user_id)?.handle || tweet.user_id.slice(0, 8)}
                        </span>
                        <span className="text-gray-400 text-[12px]">·</span>
                        <span className="text-gray-400 text-[12px]">
                          {formatRelativeTime(tweet.created_at)}
                        </span>
                      </div>
                      <p className="text-gray-700 text-[14px] leading-snug mt-2 break-words whitespace-pre-wrap mb-3">
                        {tweet.content}
                      </p>
                      <div className="flex gap-1 -mx-2">
                        <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 rounded-full hover:bg-cyan-50 hover:text-cyan-400 transition-all text-[13px] group">
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span className="group-hover:block hidden">0</span>
                        </button>
                        <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 rounded-full hover:bg-green-50 hover:text-emerald-500 transition-all text-[13px] group">
                          <Repeat2 className="w-3.5 h-3.5" />
                          <span className="group-hover:block hidden">0</span>
                        </button>
                        <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all text-[13px] group">
                          <Heart className="w-3.5 h-3.5" />
                          <span className="group-hover:block hidden">0</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}