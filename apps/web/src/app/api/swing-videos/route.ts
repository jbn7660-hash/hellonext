/**
 * Swing Videos API
 *
 * POST /api/swing-videos — Upload swing video to Cloudinary + create DB record
 * GET  /api/swing-videos — List videos (member: own, pro: linked members)
 *
 * @route /api/swing-videos
 * @feature F-004, F-005, F-009
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Tables } from '@/lib/supabase/types';

const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`;
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_VIDEO_DURATION_SEC = 60;
const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;
    const source = (formData.get('source') as string) ?? 'camera'; // camera | gallery | dropzone
    const memberId = formData.get('member_id') as string | null; // For pro uploading for a member

    if (!videoFile) {
      return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
    }

    // Validate file
    if (!ALLOWED_TYPES.includes(videoFile.type)) {
      return NextResponse.json(
        { error: '지원하지 않는 영상 형식입니다. MP4, WebM, MOV 파일을 사용해주세요.' },
        { status: 400 }
      );
    }

    if (videoFile.size > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json(
        { error: '영상이 너무 큽니다. 100MB 이하의 영상을 사용해주세요.' },
        { status: 400 }
      );
    }

    // Determine uploader role
    const { data: memberProfileRaw } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const memberProfile = memberProfileRaw as Pick<Tables<'member_profiles'>, 'id'> | null;

    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const proProfile = proProfileRaw as Pick<Tables<'pro_profiles'>, 'id'> | null;

    const uploaderMemberId = memberProfile?.id ?? memberId;
    const uploaderProId = proProfile?.id ?? null;

    // Verify user has permission to upload for this member
    if (!uploaderMemberId && !uploaderProId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    if (uploaderProId && memberId && memberProfile) {
      // Pro cannot upload as member
      return NextResponse.json(
        { error: 'Invalid uploader configuration' },
        { status: 400 }
      );
    }

    // Upload to Cloudinary
    const cloudinaryForm = new FormData();
    cloudinaryForm.append('file', videoFile);
    cloudinaryForm.append('upload_preset', process.env.CLOUDINARY_UPLOAD_PRESET ?? 'hellonext_swing');
    cloudinaryForm.append('resource_type', 'video');
    cloudinaryForm.append('folder', `swings/${uploaderMemberId ?? uploaderProId}`);

    // Request 720p transformation
    cloudinaryForm.append('eager', 'c_limit,w_1280,h_720,q_auto/f_mp4');
    cloudinaryForm.append('eager_async', 'true');

    const cloudinaryRes = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: cloudinaryForm,
    });

    if (!cloudinaryRes.ok) {
      const errBody = await cloudinaryRes.text();
      logger.error('Cloudinary upload failed', { status: cloudinaryRes.status, body: errBody });
      return NextResponse.json({ error: '영상 업로드에 실패했습니다.' }, { status: 502 });
    }

    const cloudinaryData = await cloudinaryRes.json();

    // Validate duration
    if (cloudinaryData.duration > MAX_VIDEO_DURATION_SEC) {
      return NextResponse.json(
        { error: `영상이 ${MAX_VIDEO_DURATION_SEC}초를 초과합니다. 짧은 영상을 사용해주세요.` },
        { status: 400 }
      );
    }

    // Create DB record — swing_videos schema: cloudinary_id, video_url, thumbnail_url, duration_sec, source, member_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insertedRaw, error } = await (supabase as any)
      .from('swing_videos')
      .insert({
        member_id: uploaderMemberId ?? '',
        cloudinary_id: cloudinaryData.public_id,
        video_url: cloudinaryData.secure_url,
        thumbnail_url: (cloudinaryData.secure_url as string).replace(/\.[^.]+$/, '.jpg'),
        duration_sec: Math.round(cloudinaryData.duration as number),
        source,
      })
      .select('id, video_url, thumbnail_url, duration_sec, source')
      .single();
    const data = insertedRaw as Pick<Tables<'swing_videos'>, 'id' | 'video_url' | 'thumbnail_url' | 'duration_sec' | 'source'> | null;

    if (error) {
      logger.error('Swing video insert failed', { error: error.message });
      return NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 });
    }

    logger.info('Swing video uploaded', {
      videoId: data?.id,
      source,
      durationSec: data?.duration_sec,
      memberId: uploaderMemberId,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    logger.error('Swing video POST error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(Number(searchParams.get('page') ?? '1'), 1);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '20'), 1), 100);
    const memberIdFilter = searchParams.get('member_id');

    // Check user role
    const { data: memberProfileRaw } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const memberProfile = memberProfileRaw as Pick<Tables<'member_profiles'>, 'id'> | null;

    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const proProfile = proProfileRaw as Pick<Tables<'pro_profiles'>, 'id'> | null;

    // Build query — swing_videos schema: id, video_url, thumbnail_url, duration_sec, source, created_at, member_id
    let query = supabase
      .from('swing_videos')
      .select('id, video_url, thumbnail_url, duration_sec, source, created_at, member_id', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (memberProfile) {
      // Member sees own videos only
      query = query.eq('member_id', memberProfile.id);
    } else if (proProfile && memberIdFilter) {
      // C6 Fix: Pro-member link 검증 (인가 우회 방지)
      const { data: linkRaw } = await supabase
        .from('pro_member_links')
        .select('id')
        .eq('pro_id', proProfile.id)
        .eq('member_id', memberIdFilter)
        .eq('status', 'active')
        .maybeSingle();
      const link = linkRaw as Pick<Tables<'pro_member_links'>, 'id'> | null;

      if (!link) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: '해당 회원과의 연결이 없습니다.' } },
          { status: 403 }
        );
      }

      query = query.eq('member_id', memberIdFilter);
    } else {
      // No permission
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: videosRaw, error, count } = await query;
    const videos = videosRaw as Array<Pick<Tables<'swing_videos'>, 'id' | 'video_url' | 'thumbnail_url' | 'duration_sec' | 'source' | 'created_at' | 'member_id'>> | null;

    if (error) {
      logger.error('Swing videos fetch failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
    }

    return NextResponse.json({
      data: videos ?? [],
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (err) {
    logger.error('Swing videos GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
