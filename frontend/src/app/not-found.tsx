import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap max-w-md py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">This page isn&apos;t available.</p>
      <Link href="/" className="mt-6 inline-block text-sage hover:text-sage-hover">
        Back to home
      </Link>
    </div>
  );
}
