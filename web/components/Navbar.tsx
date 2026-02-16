"use client";

import Link from "next/link";
import { useState } from "react";
import { FiMenu, FiX } from "react-icons/fi";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const closeSidebar = () => setIsOpen(false);

  const navLinks = [
    { href: "/stats", label: "System" },
    { href: "/stream", label: "Stream" },
    { href: "/replay", label: "Replay" },
    { href: "/gallery", label: "Gallery" },
  ];

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 bg-black/50 backdrop-blur-md border-b border-white/10">
        <div className="text-xl font-bold text-white tracking-widest z-50">
          <Link href="/" onClick={closeSidebar}>TOAST'S HOME</Link>
        </div>

        {/* Desktop Menu - visible on medium screens and up */}
        <div className="hidden md:flex gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-zinc-300 hover:text-white transition-colors duration-200 text-sm font-medium uppercase tracking-wide"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Mobile Hamburger Button - hidden on medium screens and up */}
        <button
          onClick={toggleSidebar}
          className="md:hidden text-white text-2xl z-50 focus:outline-none"
          aria-label="Toggle menu"
        >
          {isOpen ? <FiX /> : <FiMenu />}
        </button>
      </nav>

      {/* Mobile Sidebar Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        onClick={closeSidebar}
      />

      {/* Mobile Sidebar Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-40 w-64 bg-zinc-900 border-l border-white/10 p-8 pt-24 transform transition-transform duration-300 ease-in-out md:hidden ${isOpen ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="flex flex-col gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeSidebar}
              className="text-white text-lg font-medium uppercase tracking-wide hover:text-amber-400 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
