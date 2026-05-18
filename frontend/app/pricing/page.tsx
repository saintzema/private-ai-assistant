import Link from "next/link";
import { Brain, Check, ArrowRight, Zap, Building2, Cloud } from "lucide-react";

export const metadata = {
  title: "Pricing — PrivateAI",
  description: "Simple, transparent pricing for every team size.",
};

const plans = [
  {
    name: "Starter",
    icon: Zap,
    price: 49,
    period: "month",
    description: "Perfect for small teams getting started with AI knowledge management.",
    highlight: false,
    features: [
      "3 workspaces",
      "5 team members",
      "500 MB document storage",
      "50 AI queries / day",
      "PDF, DOCX, TXT support",
      "Email support",
      "7-day chat history",
    ],
    cta: "Start Free Trial",
    href: "/auth/register?plan=starter",
  },
  {
    name: "Professional",
    icon: Building2,
    price: 199,
    period: "month",
    description: "For growing teams that need more power, storage, and integrations.",
    highlight: true,
    badge: "Most Popular",
    features: [
      "Unlimited workspaces",
      "25 team members",
      "10 GB document storage",
      "Unlimited AI queries",
      "All file formats + CSV",
      "Priority support",
      "Full chat history",
      "API access",
      "Audit logs",
      "Custom AI model selection",
    ],
    cta: "Start Free Trial",
    href: "/auth/register?plan=professional",
  },
  {
    name: "Enterprise",
    icon: Cloud,
    price: null,
    period: null,
    description: "Custom contracts, SLAs, dedicated infrastructure, and white-glove onboarding.",
    highlight: false,
    features: [
      "Unlimited everything",
      "Dedicated deployment",
      "Custom SLA (99.99% uptime)",
      "SSO / SAML integration",
      "Custom AI fine-tuning",
      "AWS PrivateLink support",
      "HIPAA / SOC 2 compliance",
      "Dedicated account manager",
      "Custom billing & invoicing",
    ],
    cta: "Contact Sales",
    href: "mailto:sales@privateai.io",
  },
];

const faqs = [
  { q: "Is there a free trial?", a: "Yes — all paid plans come with a 14-day free trial, no credit card required." },
  { q: "Can I change plans later?", a: "Absolutely. Upgrade or downgrade at any time. Prorated billing applies automatically." },
  { q: "Is my data private?", a: "100%. Your documents and embeddings are stored in isolated tenant namespaces. We never use your data to train AI models." },
  { q: "What AI models are supported?", a: "OpenAI GPT-4o / GPT-4o-mini and AWS Bedrock Claude 3.5 Sonnet. Enterprise plans can bring their own API keys." },
  { q: "Can I deploy on my own AWS account?", a: "Yes — the Enterprise plan supports VPC-isolated deployments on your own AWS infrastructure. Contact sales for details." },
  { q: "Is AWS Marketplace billing available?", a: "Yes. You can subscribe directly through AWS Marketplace and have charges consolidated in your AWS bill." },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white text-lg">PrivateAI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">Sign in</Link>
            <Link href="/auth/register" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-16 px-4 text-center">
        <h1 className="text-5xl font-bold text-slate-900 dark:text-white mb-4">Simple, transparent pricing</h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Start free. No credit card required. Scale as your team grows.
        </p>
      </section>

      {/* Plans */}
      <section className="pb-24 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl border p-8 flex flex-col ${
                  plan.highlight
                    ? "border-blue-500 bg-blue-600 text-white shadow-2xl shadow-blue-500/20 scale-105"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${
                  plan.highlight ? "bg-white/20" : "bg-blue-50 dark:bg-blue-950"
                }`}>
                  <Icon className={`w-6 h-6 ${plan.highlight ? "text-white" : "text-blue-600 dark:text-blue-400"}`} />
                </div>

                <h2 className={`text-xl font-bold mb-2 ${plan.highlight ? "text-white" : "text-slate-900 dark:text-white"}`}>
                  {plan.name}
                </h2>
                <p className={`text-sm mb-6 ${plan.highlight ? "text-blue-100" : "text-slate-500"}`}>
                  {plan.description}
                </p>

                <div className="mb-8">
                  {plan.price !== null ? (
                    <div className="flex items-end gap-1">
                      <span className={`text-5xl font-bold ${plan.highlight ? "text-white" : "text-slate-900 dark:text-white"}`}>
                        ${plan.price}
                      </span>
                      <span className={`text-sm mb-2 ${plan.highlight ? "text-blue-200" : "text-slate-400"}`}>/ {plan.period}</span>
                    </div>
                  ) : (
                    <div className={`text-3xl font-bold ${plan.highlight ? "text-white" : "text-slate-900 dark:text-white"}`}>
                      Custom
                    </div>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${plan.highlight ? "text-blue-200" : "text-blue-600 dark:text-blue-400"}`} />
                      <span className={`text-sm ${plan.highlight ? "text-blue-50" : "text-slate-600 dark:text-slate-400"}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.highlight
                      ? "bg-white text-blue-600 hover:bg-blue-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {plan.cta} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })}
        </div>

        {/* AWS Marketplace note */}
        <p className="text-center text-sm text-slate-500 mt-10">
          Available on{" "}
          <a href="https://aws.amazon.com/marketplace" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
            AWS Marketplace
          </a>
          {" "}— consolidate billing in your AWS account.
        </p>
      </section>

      {/* FAQ */}
      <section className="py-24 px-4 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-center mb-12">Frequently asked questions</h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <div key={faq.q} className="border-b border-slate-200 dark:border-slate-800 pb-6">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">{faq.q}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-4 text-center text-sm text-slate-500">
        <p>© 2025 PrivateAI. All rights reserved. ·{" "}
          <Link href="/" className="hover:text-slate-900 dark:hover:text-white transition-colors">Home</Link>
        </p>
      </footer>
    </div>
  );
}
