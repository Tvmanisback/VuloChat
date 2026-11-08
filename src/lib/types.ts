export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';
export type ChannelType = 'category' | 'text' | 'voice';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  animated_avatar: boolean;
  decoration_id: string | null;
  banner_url: string | null;
  animated_banner: boolean;
  accent_color: string | null;
  custom_status: string | null;
  about: string | null;
  status: UserStatus;
  created_at: string;
}

export interface AvatarDecoration {
  id: string;
  name: string;
  asset_path: string;
  animated: boolean;
  position: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  color: string;
  position: number;
}

export interface Server {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
  created_at: string;
}

export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string;
  permissions: number;
  position: number;
  is_default: boolean;
}

export interface MemberRow {
  server_id: string;
  user_id: string;
  nickname: string | null;
  joined_at: string;
  profiles: Profile | null;
}

export interface MemberRoleRow {
  server_id: string;
  user_id: string;
  role_id: string;
}

export interface Channel {
  id: string;
  server_id: string;
  parent_id: string | null;
  type: ChannelType;
  name: string;
  topic: string | null;
  position: number;
}

export interface Attachment {
  name: string;
  path: string;
  type: string;
  size: number;
}

export interface Embed {
  type: 'image' | 'link';
  url: string;
  host: string;
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  attachments: Attachment[];
  embeds: Embed[];
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  attachments: Attachment[];
  embeds: Embed[];
  created_at: string;
  edited_at: string | null;
  read_at: string | null;
}

export interface Friend {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

export interface Invite {
  code: string;
  server_id: string;
  created_by: string | null;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export interface VoiceState {
  user_id: string;
  server_id: string;
  channel_id: string;
  self_mute: boolean;
  self_deafen: boolean;
  joined_at: string;
}
