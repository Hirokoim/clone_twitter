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

export default function MyProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTweetId, setEditingTweetId] = useState<string | null>(null);
  const [editingTweetContent, setEditingTweetContent] = useState('');

  // ユーザー情報と認証状態の確認
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      setUser(user);
      setLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.push('/');
        return;
      }
      setUser(session.user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // プロフィール情報の読み込み
  useEffect(() => {
    if (!user) return;
    loadProfileData();

    // follows テーブルのリアルタイム購読
    const subscription = supabase
      .channel(`myprofile-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'follows' },
        () => loadProfileData()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const loadProfileData = async () => {
    if (!user) return;

    try {
      // プロフィール情報を読み込む
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;
      if (profileData) {
        setHandle(profileData.handle || '');
        setDisplayName(profileData.display_name || '');
        setIsPrivate(profileData.is_private || false);
      }

      // 自分のツイートを読み込む
      const { data: tweetsData, error: tweetsError } = await supabase
        .from('tweets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (tweetsError) throw tweetsError;
      setTweets(tweetsData || []);

      // フォロワー数を読み込む（自分がフォローされている）
      const { count: followerCountData } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('followee_id', user.id);

      setFollowerCount(followerCountData || 0);

      // フォロー中の人数を読み込む
      const { count: followingCountData } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id);

      setFollowingCount(followingCountData || 0);
    } catch (error) {
      console.error('プロフィール読み込みエラー:', error);
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

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!handle.trim()) {
      alert('ハンドルを入力してください');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          handle: handle.trim(),
          display_name: displayName.trim(),
          is_private: isPrivate,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setIsEditing(false);
      // ホーム画面を更新するため、親コンポーネントに通知（リロードで反映される）
      alert('プロフィールを更新しました');
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      alert('プロフィールの更新に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  // ツイート編集
  const handleEditTweet = (id: string, content: string) => {
    setEditingTweetId(id);
    setEditingTweetContent(content);
  };

  // ツイート編集保存
  const handleSaveEditTweet = async (id: string) => {
    if (!editingTweetContent.trim()) {
      alert('ツイート内容を入力してください');
      return;
    }

    try {
      const { error } = await supabase
        .from('tweets')
        .update({ content: editingTweetContent.trim() })
        .eq('id', id);

      if (error) throw error;

      setEditingTweetId(null);
      setEditingTweetContent('');
      await loadProfileData();
    } catch (error) {
      console.error('ツイート編集エラー:', error);
      alert('ツイート編集に失敗しました');
    }
  };

  // ツイート削除
  const handleDeleteTweet = async (id: string) => {
    if (!confirm('削除しますか？')) return;

    try {
      const { error } = await supabase.from('tweets').delete().eq('id', id);
      if (error) throw error;
      await loadProfileData();
    } catch (error) {
      console.error('ツイート削除エラー:', error);
      alert('ツイート削除に失敗しました');
    }
  };

  // ツイート編集キャンセル
  const handleCancelEditTweet = () => {
    setEditingTweetId(null);
    setEditingTweetContent('');
  };

  if (!user) {
    return null;
  }

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
          <h1 className="text-xl font-bold">マイプロフィール</h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* プロフィールセクション */}
        <div className="border-b border-gray-200 p-4">
          {isEditing ? (
            // 編集モード
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2">ハンドル</label>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">表示名</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="表示名"
                />
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm font-bold">
                    {isPrivate ? '🔒 非公開アカウント' : '🌍 公開アカウント'}
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {isPrivate
                    ? 'フォロワーだけがあなたのツイートを見られます'
                    : '誰でもあなたのツイートを見られます'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-bold"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 font-bold"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            // 表示モード
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-blue-500 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold">{displayName || 'あなた'}</h2>
                      <span className="text-lg">{isPrivate ? '🔒' : '🌍'}</span>
                    </div>
                    <p className="text-gray-500 text-sm">@{handle || user.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {isPrivate ? '非公開アカウント' : '公開アカウント'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 font-bold text-sm"
                >
                  編集
                </button>
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
                <div>
                  <span className="font-bold text-gray-900">{tweets.length}</span>
                  <span className="text-gray-500"> ツイート</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ツイート一覧 */}
        <div className="divide-y divide-gray-200">
          <div className="p-4 bg-blue-50 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">あなたのツイート</h3>
          </div>
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
                {editingTweetId === tweet.id ? (
                  // 編集モード
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold">あなた</span>
                      </div>
                      <textarea
                        value={editingTweetContent}
                        onChange={(e) => setEditingTweetContent(e.target.value)}
                        maxLength={280}
                        className="w-full p-2 border border-blue-500 rounded text-gray-900 resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleSaveEditTweet(tweet.id)}
                          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-bold"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleCancelEditTweet}
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
                          <span className="font-bold">あなた</span>
                          <span className="text-gray-500">
                            {new Date(tweet.created_at).toLocaleDateString('ja-JP')}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditTweet(tweet.id, tweet.content)}
                            className="text-blue-500 hover:text-blue-700 text-sm font-bold"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteTweet(tweet.id)}
                            className="text-red-500 hover:text-red-700 text-sm font-bold"
                          >
                            削除
                          </button>
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
