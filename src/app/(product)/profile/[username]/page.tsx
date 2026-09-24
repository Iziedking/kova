import type { Metadata } from "next";
import { ProfileScreen } from "@/features/social/profile-screen";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)} · Kova`, description: "A Kova player's record: matches, wins and trading performance." };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ProfileScreen username={decodeURIComponent(username)} />;
}
