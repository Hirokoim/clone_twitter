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
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [tweetInput, setTweetInput] = useState('');
  const [isPosting, setIsPosting] = useState(false);

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
        setAvatarUrl(profileData.avatar_url || '');
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
      <div className="flex h-screen items-center justify-center bg-teal-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
          <p className="mt-4 text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;

    // ファイルサイズチェック（1MB以下）
    const maxSize = 1024 * 1024; // 1MB
    if (file.size > maxSize) {
      alert('画像は1MB以下にしてください。現在のサイズ: ' + (file.size / 1024 / 1024).toFixed(2) + 'MB');
      return;
    }

    // ファイル形式チェック
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const fileName = `${user.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        if (uploadError.message.includes('not found')) {
          throw new Error('avatarsバケットが見つかりません。Supabaseダッシュボードで作成してください。');
        }
        throw uploadError;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      setAvatarUrl(publicUrl);

      // profiles テーブルを update（upsert ではなく）
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;
      alert('✅ プロフィール写真を更新しました！');
    } catch (error: any) {
      console.error('画像アップロードエラー:', error);
      alert('❌ エラー: ' + (error.message || '画像のアップロードに失敗しました'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

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
      setIsPostModalOpen(false);
      await loadProfileData();
    } catch (error) {
      console.error('投稿エラー:', error);
      alert('投稿に失敗しました');
    } finally {
      setIsPosting(false);
    }
  };

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
        .update({
          handle: handle.trim(),
          display_name: displayName.trim(),
          is_private: isPrivate,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

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
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-gray-800 font-medium text-[15px] hover:bg-cyan-50 transition-all duration-150 bg-cyan-50"
          >
            <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
            <span>マイページ</span>
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
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-contain" />
            ) : (
              user.email?.[0].toUpperCase()
            )}
          </div>
          <div className="text-left flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">{displayName || 'あなた'}</div>
            <div className="text-xs text-gray-500 truncate">@{handle || user.email?.split('@')[0]}</div>
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
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-contain" />
                ) : (
                  user?.email?.[0].toUpperCase()
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
          <h2 className="m-0 text-[17px] font-bold text-gray-800 tracking-tight">マイページ</h2>
        </div>
        {/* Profile Banner */}
        <div className="h-36 bg-gradient-to-r from-cyan-400 to-emerald-500 relative overflow-hidden">
          <div className="absolute right-0 bottom-0 w-48 h-48 rounded-full bg-white/10"></div>
          <div className="absolute left-12 top-0 w-32 h-32 rounded-full bg-white/5"></div>
        </div>

        {/* プロフィールセクション */}
        <div className="border-b border-gray-200 px-5 pt-3">
          {isEditing ? (
            // 編集モード
            <div className="space-y-5 pb-5">
              {/* Avatar Upload */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-800">プロフィール写真</label>
                <div className="flex items-end gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xl overflow-hidden border-2 border-gray-200">
                    {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-contain" /> : '📷'}
                  </div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleAvatarUpload(file);
                        }
                      }}
                      disabled={isUploadingAvatar}
                      className="hidden"
                    />
                    <span className="inline-block px-4 py-2 bg-cyan-50 text-cyan-600 rounded-full font-semibold text-sm hover:bg-cyan-100 transition-colors">
                      {isUploadingAvatar ? 'アップロード中...' : '画像を変更'}
                    </span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">JPG形式の画像をアップロードしてください（推奨: 200x200px）</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-800">ハンドル</label>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-[14px] transition-all"
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-800">表示名</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-[14px] transition-all"
                  placeholder="表示名"
                />
              </div>
              <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-cyan-400 focus:ring-cyan-400 mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="text-sm font-semibold text-gray-800 block">
                      {isPrivate ? '🔒 非公開アカウント' : '🌍 公開アカウント'}
                    </span>
                    <p className="text-xs text-gray-600 mt-1">
                      {isPrivate
                        ? 'フォロワーだけがあなたのツイートを見られます'
                        : '誰でもあなたのツイートを見られます'}
                    </p>
                  </span>
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-400 to-emerald-500 text-white rounded-full hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 font-semibold transition-all duration-200 text-sm"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 font-semibold transition-colors text-sm"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            // 表示モード
            <>
              <div className="flex items-end justify-between mb-4 -mt-10 pb-4">
                <div className="w-18 h-18 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex-shrink-0 border-4 border-white shadow-lg overflow-hidden">
                  {avatarUrl && <img src={avatarUrl} alt="avatar" className="w-full h-full object-contain" />}
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-2 border-2 border-gray-200 text-gray-700 rounded-full hover:border-cyan-400 hover:text-cyan-400 font-semibold text-sm transition-colors"
                >
                  プロフィール編集
                </button>
              </div>

              <div className="pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-[19px] font-bold text-gray-800">{displayName || 'あなた'}</h2>
                  <span className="text-lg">{isPrivate ? '🔒' : '🌍'}</span>
                </div>
                <p className="text-gray-500 text-[13px] mb-3">@{handle || user.id.slice(0, 8)}</p>
                <p className="text-gray-700 text-[14px] leading-snug mb-3">
                  {isPrivate ? '非公開アカウント' : '公開アカウント'}
                </p>

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
                  <div className="pt-3">
                    <span className="font-bold text-gray-900 text-[15px]">{tweets.length}</span>
                    <span className="text-gray-500 text-[13px]"> ツイート</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ツイート一覧 */}
        <div className="divide-y divide-gray-100">
          <div className="px-5 py-4 bg-teal-50/50 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-[15px]">あなたのツイート</h3>
          </div>
          {tweets.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-[15px]">
              ツイートがありません
            </div>
          ) : (
            tweets.map((tweet) => (
              <div
                key={tweet.id}
                className="px-5 py-4 hover:bg-cyan-50/40 transition-colors duration-150 border-b border-gray-100 last:border-b-0"
              >
                {editingTweetId === tweet.id ? (
                  // 編集モード
                  <div className="flex gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-800 text-sm">あなた</span>
                      </div>
                      <textarea
                        value={editingTweetContent}
                        onChange={(e) => setEditingTweetContent(e.target.value)}
                        maxLength={280}
                        className="w-full p-2 border border-cyan-400 rounded text-gray-800 resize-none text-[14px]"
                        rows={3}
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleSaveEditTweet(tweet.id)}
                          className="px-4 py-1.5 bg-gradient-to-r from-cyan-400 to-emerald-500 text-white rounded-full hover:shadow-md text-xs font-semibold transition-all"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleCancelEditTweet}
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
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-gray-800 text-[14px]">あなた</span>
                          <span className="text-gray-400 text-[12px]">·</span>
                          <span className="text-gray-400 text-[12px]">
                            {new Date(tweet.created_at).toLocaleDateString('ja-JP')}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditTweet(tweet.id, tweet.content)}
                            className="text-cyan-500 hover:text-cyan-600 text-xs font-semibold transition-colors"
                          >
                            ✏️ 編集
                          </button>
                          <button
                            onClick={() => handleDeleteTweet(tweet.id)}
                            className="text-gray-400 hover:text-red-500 text-xs font-semibold transition-colors"
                          >
                            🗑️ 削除
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-700 text-[14px] leading-snug mt-2 break-words whitespace-pre-wrap">
                        {tweet.content}
                      </p>
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
