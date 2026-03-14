/**
 * Invite Landing Page
 *
 * Public page that displays pro information for an invite link.
 * Redirects the user to signup with the invite code pre-filled.
 *
 * @page /invite/[code]
 * @feature F-007 가입/인증
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/server';

type InviteLinkWithPro = {
  id: string;
  invite_code: string;
  status: string;
  pro_profiles: {
    display_name: string;
    studio_name: string | null;
    specialty: string | null;
  };
};

interface InvitePageProps {
  params: Promise<{ code: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { code } = await params;

  if (!code || code.length < 4) {
    notFound();
  }

  const supabase = createServiceClient();

  // Fetch invite link with pro info (service client bypasses RLS)
  const { data: linkRaw, error } = await supabase
    .from('pro_member_links')
    .select(`
      id,
      invite_code,
      status,
      pro_profiles!inner(
        display_name,
        studio_name,
        specialty
      )
    `)
    .eq('invite_code', code)
    .single();

  const link = linkRaw as unknown as InviteLinkWithPro | null;

  if (error || !link) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-secondary px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <span className="text-3xl">!</span>
          </div>
          <h1 className="text-xl font-bold text-text-primary">
            유효하지 않은 초대 링크
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            초대 링크가 올바르지 않거나 만료되었습니다.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            로그인 페이지로 이동
          </Link>
        </div>
      </div>
    );
  }

  if (link.status !== 'invited') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-secondary px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <span className="text-3xl">!</span>
          </div>
          <h1 className="text-xl font-bold text-text-primary">
            이미 사용된 초대 링크
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            이 초대 링크는 이미 사용되었습니다. 새로운 초대를 요청해주세요.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            로그인 페이지로 이동
          </Link>
        </div>
      </div>
    );
  }

  const pro = link.pro_profiles;

  const signupUrl = `/login?mode=signup&role=member&invite=${code}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-secondary px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-6 text-center">
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-100">
            <span className="text-xl">⛳</span>
          </div>
          <p className="text-xs text-text-tertiary">HelloNext</p>
        </div>

        {/* Pro Info Card */}
        <div className="rounded-2xl bg-surface-primary p-6 shadow-sm border border-gray-100">
          <div className="text-center">
            <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-2xl">
              ⛳
            </div>
            <h1 className="text-lg font-bold text-text-primary">
              {pro.display_name} 프로
            </h1>
            {pro.studio_name && (
              <p className="mt-1 text-sm text-text-secondary">
                {pro.studio_name}
              </p>
            )}
            {pro.specialty && (
              <span className="mt-2 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                {pro.specialty}
              </span>
            )}
          </div>

          <div className="mt-5 border-t border-gray-100 pt-5 text-center">
            <p className="text-sm text-text-secondary">
              {pro.display_name} 프로님이 회원님을 초대했습니다.
              <br />
              가입하고 AI 코칭을 시작하세요!
            </p>
          </div>
        </div>

        {/* CTA */}
        <Link
          href={signupUrl}
          className="mt-5 flex w-full items-center justify-center rounded-2xl bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white hover:bg-brand-600 active:bg-brand-700 transition-colors"
        >
          회원가입하고 연결하기
        </Link>

        {/* Already have an account */}
        <div className="mt-4 text-center">
          <Link
            href={`/login?invite=${code}`}
            className="text-sm text-text-secondary hover:text-brand-600 transition-colors"
          >
            이미 계정이 있으신가요? <span className="font-semibold text-brand-600">로그인</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
