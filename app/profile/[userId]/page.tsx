'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [tweetInput, setTweetInput] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());

  // ユーザー情報と認証状態の確認
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      setLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // プロフィール情報の読み込み＆リアルタイム購読
  useEffect(() => {
    if (!userId) return;
    loadProfileData();

    // follows テーブルのリアルタイム購読
    const subscription = supabase
      .channel(`profile-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'follows' },
        () => loadProfileData()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId, currentUser]);

  const loadProfileData = async () => {
    try {
      // プロフィール情報を読み込む
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;
      if (profileData) {
        setHandle(profileData.handle || '');
        setDisplayName(profileData.display_name || '');
      }

      // ツイートを読み込む
      const { data: tweetsData, error: tweetsError } = await supabase
        .from('tweets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (tweetsError) throw tweetsError;
      setTweets(tweetsData || []);

      // フォロワー数を読み込む
      const { count: followerCountData } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('followee_id', userId);

      setFollowerCount(followerCountData || 0);

      // フォロー中の人数を読み込む
      const { count: followingCountData } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

      setFollowingCount(followingCountData || 0);

      // フォロー状態を確認
      if (currentUser && currentUser.id !== userId) {
        const { data: followData } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', currentUser.id)
          .eq('followee_id', userId)
          .single();

        setIsFollowing(!!followData);
      }
    } catch (error) {
      console.error('プロフィール読み込みエラー:', error);
    }
  };

  // フォロー処理
  const handleFollow = async () => {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: currentUser.id, followee_id: userId });

      if (error) throw error;
      setIsFollowing(true);
      setFollowerCount(followerCount + 1);
    } catch (error) {
      console.error('フォローエラー:', error);
      alert('フォローに失敗しました');
    }
  };

  // アンフォロー処理
  const handleUnfollow = async () => {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('followee_id', userId);

      if (error) throw error;
      setIsFollowing(false);
      setFollowerCount(Math.max(0, followerCount - 1));
    } catch (error) {
      console.error('アンフォローエラー:', error);
      alert('アンフォローに失敗しました');
    }
  };

  // ツイート投稿
  const handlePost = async () => {
    if (!currentUser || !tweetInput.trim()) return;

    setIsPosting(true);
    try {
      const { error } = await supabase.from('tweets').insert({
        user_id: currentUser.id,
        content: tweetInput.trim(),
        is_public: true,
      });

      if (error) throw error;

      setTweetInput('');
      setIsPostModalOpen(false);
      await loadProfileData();
    } catch (error) {
      console.error('投稿エラー:', error);
      alert('投稿に失敗しました');
    } finally {
      setIsPosting(false);
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

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-50">
        <div className="max-w-sm w-full text-center px-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 mx-auto mb-6 flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C7.6 2 4 5.3 4 9.4c0 2.7 1.4 5.1 3.6 6.6L12 22l4.4-6c2.2-1.5 3.6-3.9 3.6-6.6C20 5.3 16.4 2 12 2zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/>
            </svg>
          </div>
          <h1 className="text-5xl font-black bg-gradient-to-r from-cyan-400 to-emerald-500 bg-clip-text text-transparent mb-4">cloneX</h1>
          <p className="text-gray-600 mb-6 text-lg">ログインしてください</p>
          <button
            onClick={() => router.push('/')}
            className="w-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-500 px-8 py-3 text-white font-bold text-lg hover:-translate-y-0.5 shadow-md hover:shadow-lg transition-all duration-200"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUser.id === userId;

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
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-gray-800 hover:bg-cyan-50 transition-all duration-150 font-medium text-[15px]"
          >
            <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
            <span>ホーム</span>
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
            {currentUser.email?.[0].toUpperCase()}
          </div>
          <div className="text-left flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">{currentUser.email?.split('@')[0]}</div>
            <div className="text-xs text-gray-500 truncate">@{currentUser.email?.split('@')[0]}</div>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              localStorage.clear();
              window.location.href = '/';
            }}
            className="text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
            title="ログアウト"
          >
            🚪
          </button>
        </div>
      </aside>

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
                {currentUser?.email?.[0].toUpperCase()}
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
                      onClick={handlePost}
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

      {/* ============ MAIN CONTENT ============ */}
      <main className="flex-1 bg-white border-r border-gray-200 min-h-screen overflow-y-auto max-w-xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-gray-200 px-5 py-3.5">
          <h2 className="m-0 text-[17px] font-bold text-gray-800 tracking-tight">プロフィール</h2>
        </div>
        {/* Profile Banner */}
        <div className="h-36 bg-gradient-to-r from-teal-600 to-emerald-600 relative overflow-hidden">
          <div className="absolute right-0 bottom-0 w-48 h-48 rounded-full bg-white/10"></div>
          <div className="absolute left-12 top-0 w-32 h-32 rounded-full bg-white/5"></div>
        </div>

        {/* プロフィールセクション */}
        <div className="border-b border-gray-200 px-5 pt-3">
          <div className="flex items-end justify-between mb-4 -mt-10 pb-4">
            <div className="w-18 h-18 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-4 border-white shadow-lg overflow-hidden">
              {/* Avatar will be loaded from profile */}
            </div>
            {!isOwnProfile && (
              <button
                onClick={isFollowing ? handleUnfollow : handleFollow}
                className={`px-6 py-2 rounded-full font-semibold text-sm transition-all duration-200 ${
                  isFollowing
                    ? 'border-2 border-gray-200 text-gray-700 hover:border-cyan-400 hover:text-cyan-400'
                    : 'border-2 border-cyan-400 bg-white text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-400 hover:to-emerald-500 hover:text-white hover:border-transparent hover:shadow-md'
                }`}
              >
                {isFollowing ? 'フォロー中' : 'フォローする'}
              </button>
            )}
          </div>

          <div className="pb-4">
            <h2 className="text-[19px] font-bold text-gray-800 mb-1">{displayName || 'ユーザー'}</h2>
            <p className="text-gray-500 text-[13px] mb-3">@{handle || userId.slice(0, 8)}</p>

            {/* フォロー情報 */}
            <div className="flex gap-6 text-sm pt-3 border-t border-gray-100">
              <div className="pt-3">
                <span className="font-bold text-gray-900 text-[15px]">{followingCount}</span>
                <span className="text-gray-500 text-[13px]"> フォロー中</span>
              </div>
              <div className="pt-3">
                <span className="font-bold text-gray-900 text-[15px]">{followerCount}</span>
                <span className="text-gray-500 text-[13px]"> フォロワー</span>
              </div>
            </div>
          </div>
        </div>

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
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-1 flex-wrap">
                      <span className="font-semibold text-gray-800 hover:underline cursor-pointer text-[14px]">
                        {displayName || 'ユーザー'}
                      </span>
                      <span className="text-gray-500 text-[13px]">
                        @{handle || tweet.user_id.slice(0, 8)}
                      </span>
                      <span className="text-gray-400 text-[12px]">·</span>
                      <span className="text-gray-400 text-[12px]">
                        {new Date(tweet.created_at).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-gray-700 text-[14px] leading-snug mt-2 break-words whitespace-pre-wrap mb-3">
                      {tweet.content}
                    </p>
                    <div className="flex gap-1 -mx-2">
                      <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 rounded-full hover:bg-cyan-50 hover:text-cyan-400 transition-all text-[13px] group">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                      </button>
                      <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 rounded-full hover:bg-green-50 hover:text-emerald-500 transition-all text-[13px] group">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                      </button>
                      <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all text-[13px] group">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
