/**
 * Step 1: Minimal static homepage — zero imports.
 * Deploy and verify 8fold.app loads. If it works, re-add components one at a time.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">8Fold — Static Test</h1>
      <p className="text-gray-600">If you see this, the homepage loads without hanging.</p>
    </div>
  );
}
