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

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-6xl font-black text-blue-400 mb-4">𝕏</h1>
          <p className="text-gray-600 mb-4">ログインしてください</p>
          <button
            onClick={() => router.push('/')}
            className="w-full rounded-full bg-blue-500 px-8 py-3 text-white font-bold text-lg hover:bg-blue-600"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUser.id === userId;

  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー */}
      <div className="border-b border-gray-200 sticky top-0 bg-white bg-opacity-80 backdrop-blur z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-blue-500 hover:text-blue-600 font-bold"
          >
            ← ホーム
          </button>
          <h1 className="text-xl font-bold">プロフィール</h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* プロフィールセクション */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-500 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-bold">{displayName || '@' + (handle || userId.slice(0, 8))}</h2>
                <p className="text-gray-500 text-sm">@{handle || userId.slice(0, 8)}</p>
              </div>
            </div>
            {!isOwnProfile && (
              <button
                onClick={isFollowing ? handleUnfollow : handleFollow}
                className={`px-6 py-2 rounded-full font-bold transition ${
                  isFollowing
                    ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {isFollowing ? 'フォロー中' : 'フォロー'}
              </button>
            )}
          </div>

          {/* フォロー情報 */}
          <div className="flex gap-6 text-sm">
            <div>
              <span className="font-bold text-gray-900">{followingCount}</span>
              <span className="text-gray-500"> フォロー中</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">{followerCount}</span>
              <span className="text-gray-500"> フォロワー</span>
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
                <div className="flex gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold hover:underline cursor-pointer">
                          @{tweet.user_id.slice(0, 8)}
                        </span>
                        <span className="text-gray-500">
                          {new Date(tweet.created_at).toLocaleDateString('ja-JP')}
                        </span>
                      </div>
                    </div>
                    <p className="text-gray-900 mt-2 break-words whitespace-pre-wrap">
                      {tweet.content}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
