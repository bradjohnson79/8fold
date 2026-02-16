import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200">
      {/* Green CTA Section */}
      <div className="bg-8fold-green">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-4xl">💰</div>
              <div>
                <h3 className="text-white text-xl font-bold">Sign up and start earning with 8Fold.</h3>
              </div>
            </div>
            <Link
              href="/signup"
              className="bg-white text-8fold-green px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>

      {/* Footer Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* LEFT COLUMN — BRAND */}
          <div>
            <div className="text-xl font-extrabold text-gray-900">8Fold</div>
            <div className="text-sm text-gray-600 mt-2">A local job routing platform.</div>
            <div className="text-sm text-gray-600 mt-4">© 2026 ANOINT Inc. All rights reserved.</div>
            <div className="text-xs text-gray-500 mt-2">8Fold is a platform operated by ANOINT Inc.</div>
          </div>

          {/* MIDDLE COLUMN — PLATFORM */}
          <div>
            <div className="font-semibold text-gray-900 mb-4">Platform</div>
            <ul className="space-y-2">
              <li>
                <Link href="/about-8fold" className="text-gray-600 hover:text-gray-900 text-sm">
                  About
                </Link>
              </li>
              <li>
                <Link href="/support" className="text-gray-600 hover:text-gray-900 text-sm">
                  Support
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-gray-600 hover:text-gray-900 text-sm">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-gray-600 hover:text-gray-900 text-sm">
                  Terms &amp; Conditions
                </Link>
              </li>
            </ul>
          </div>

          {/* RIGHT COLUMN — SIGN UP */}
          <div>
            <div className="font-semibold text-gray-900 mb-4">Sign Up</div>
            <ul className="space-y-2">
              <li>
                <Link href="/signup?role=job-poster" className="text-gray-600 hover:text-gray-900 text-sm">
                  Job Poster
                </Link>
              </li>
              <li>
                <Link href="/signup?role=router" className="text-gray-600 hover:text-gray-900 text-sm">
                  Router
                </Link>
              </li>
              <li>
                <Link href="/signup?role=contractor" className="text-gray-600 hover:text-gray-900 text-sm">
                  Contractor
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}