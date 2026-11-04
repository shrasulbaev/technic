import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-2xl font-extrabold">Страница не найдена</h1>
      <Link href="/" className="font-bold underline">На главную</Link>
    </main>
  );
}
