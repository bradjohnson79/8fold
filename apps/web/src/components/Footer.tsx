import Link from 'next/link'
import { Facebook, Linkedin, Twitter } from 'lucide-react'

interface FooterProps {
  facebookUrl?: string | null
  twitterUrl?: string | null
  linkedinUrl?: string | null
}

export function Footer({ facebookUrl, twitterUrl, linkedinUrl }: FooterProps) {
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
              href="/sign-up"
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
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span className="text-sm text-gray-600">© 2026 ANOINT Inc. All rights reserved.</span>
              {(facebookUrl || twitterUrl || linkedinUrl) && (
                <span className="flex items-center gap-2">
                  {facebookUrl && (
                    <a
                      href={facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-900 transition-colors"
                      aria-label="Facebook"
                    >
                      <Facebook className="w-5 h-5" />
                    </a>
                  )}
                  {twitterUrl && (
                    <a
                      href={twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-900 transition-colors"
                      aria-label="X (Twitter)"
                    >
                      <Twitter className="w-5 h-5" />
                    </a>
                  )}
                  {linkedinUrl && (
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-900 transition-colors"
                      aria-label="LinkedIn"
                    >
                      <Linkedin className="w-5 h-5" />
                    </a>
                  )}
                </span>
              )}
            </div>
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
                <Link href="/how-to-earn" className="text-gray-600 hover:text-gray-900 text-sm">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/support" className="text-gray-600 hover:text-gray-900 text-sm">
                  Support
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-gray-600 hover:text-gray-900 text-sm">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/media" className="text-gray-600 hover:text-gray-900 text-sm">
                  Media
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-gray-600 hover:text-gray-900 text-sm">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-gray-600 hover:text-gray-900 text-sm">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>

          {/* RIGHT COLUMN — SIGN UP */}
          <div>
            <div className="font-semibold text-gray-900 mb-4">Sign Up</div>
            <ul className="space-y-2">
              <li>
                <Link href="/sign-up" className="text-gray-600 hover:text-gray-900 text-sm">
                  Sign Up
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
