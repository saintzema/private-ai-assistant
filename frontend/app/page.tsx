import Link from "next/link";
import { Brain, Shield, Users, Upload, Search, Cloud, ArrowRight, CheckCircle } from "lucide-react";

export const metadata = {
  title: "Private AI Knowledge Assistant — Enterprise RAG for Your Documents",
  description: "Secure, multi-tenant AI knowledge assistant with RAG. Available on AWS Marketplace.",
};

const features = [
  { icon: Brain, title: "RAG-Powered Answers", description: "Accurate, cited answers from your internal documents using Retrieval-Augmented Generation." },
  { icon: Shield, title: "Enterprise Security", description: "Tenant isolation, encrypted storage, JWT auth, RBAC, and full audit logs by default." },
  { icon: Users, title: "Team Collaboration", description: "Invite teammates, assign roles, share knowledge across your entire organization." },
  { icon: Upload, title: "Multi-Format Uploads", description: "PDF, DOCX, TXT, CSV up to 50MB. Auto parsing, chunking, and embedding generation." },
  { icon: Search, title: "Semantic Search", description: "pgvector-powered cosine similarity search finds the most relevant content instantly." },
  { icon: Cloud, title: "AWS Marketplace Ready", description: "SaaS fulfillment, entitlement checks, and usage metering built in." },
];

const steps = [
  { n: "01", title: "Upload Documents", desc: "Drag & drop PDFs, Word docs, and spreadsheets. Automatic parsing and indexing." },
  { n: "02", title: "Ask Questions", desc: "Type any question in plain English. RAG retrieves the most relevant context." },
  { n: "03", title: "Get Cited Answers", desc: "Accurate streaming responses with source citations — no hallucinations." },
];

const testimonials = [
  { name: "Sarah Chen", role: "Head of Engineering, Meridian Financial", quote: "We replaced our internal wiki search. Our team finds policy documents 10× faster with accurate answers." },
  { name: "Marcus Williams", role: "VP of Operations, HealthCore Systems", quote: "The HIPAA-compliant, tenant-isolated architecture was non-negotiable. This delivered it out of the box." },
  { name: "Priya Sharma", role: "CTO, LegalEdge Tech", quote: "Our legal analysts spend 70% less time searching case files. Source citations make it audit-friendly." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white text-lg">PrivateAI</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">Features</a>
            <a href="#how-it-works" className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">How it works</a>
            <Link href="/pricing" className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">Pricing</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">Sign in</Link>
            <Link href="/auth/register" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 pb-32 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950" />
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Now available on AWS Marketplace
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 dark:text-white mb-6 leading-tight">
            Your Private{" "}
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
              AI Knowledge
            </span>{" "}
            Base
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            Upload company documents. Ask questions in plain English. Get accurate, cited answers — without sending data to third parties. Enterprise-grade multi-tenant SaaS.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/register" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-base hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/25 hover:-translate-y-0.5">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="https://aws.amazon.com/marketplace" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-base hover:bg-slate-50 dark:hover:bg-slate-900 transition-all">
              <Cloud className="w-4 h-4" /> AWS Marketplace
            </a>
          </div>
          <p className="mt-6 text-sm text-slate-500">No credit card required · 14-day free trial</p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 py-12 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[["99.9%", "Uptime SLA"], ["<200ms", "Search Speed"], ["50MB", "Max File Size"], ["OpenAI + Bedrock", "AI Providers"]].map(([v, l]) => (
            <div key={l}><div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{v}</div><div className="text-sm text-slate-500">{l}</div></div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">Everything for enterprise AI</h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">Built for security-conscious teams that need AI without compromising data privacy or compliance.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map(f => (
              <div key={f.title} className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-lg transition-all group">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mb-5 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors">
                  <f.icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-4 bg-slate-50 dark:bg-slate-900/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">Up and running in minutes</h2>
            <p className="text-lg text-slate-600 dark:text-slate-400">Three steps from sign-up to AI-powered answers.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {steps.map(s => (
              <div key={s.n} className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-5 shadow-lg shadow-blue-500/20">{s.n}</div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{s.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-slate-900 dark:text-white text-center mb-16">Trusted by enterprise teams</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map(t => (
              <div key={t.name} className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mb-6 italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {t.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 bg-gradient-to-br from-blue-600 to-violet-700">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to build your AI knowledge base?</h2>
          <p className="text-blue-100 text-lg mb-8">Start free. No credit card. Deploy to AWS in minutes.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/register" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-all">
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/pricing" className="inline-flex items-center px-8 py-3.5 rounded-xl border border-white/30 text-white font-semibold hover:bg-white/10 transition-all">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-900 dark:text-white">PrivateAI</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <Link href="/pricing" className="hover:text-slate-900 dark:hover:text-white transition-colors">Pricing</Link>
            <a href="https://aws.amazon.com/marketplace" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 dark:hover:text-white transition-colors">AWS Marketplace</a>
          </div>
          <p className="text-sm text-slate-500">© 2025 PrivateAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
