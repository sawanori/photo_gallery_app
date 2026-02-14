'use client';

import { AuthProvider } from "@/contexts/AuthContext";
import { GalleryProvider } from "@/contexts/GalleryContext";

export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <GalleryProvider>
        {children}
      </GalleryProvider>
    </AuthProvider>
  );
}
