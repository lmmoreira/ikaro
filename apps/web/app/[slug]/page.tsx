interface HotsitePageProps {
  params: Promise<{ slug: string }>;
}

export default async function HotsitePage({ params }: HotsitePageProps) {
  const { slug } = await params;
  return (
    <main>
      <p>Hotsite para {slug}</p>
    </main>
  );
}
