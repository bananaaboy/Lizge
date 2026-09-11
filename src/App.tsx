import { Dashboard } from './components/Dashboard'
import { Architecture, Faq, Footer, Hero, Nav, PrivacyBanner } from './components/Landing'

export default function App() {
  return (
    <div className="min-h-dvh bg-cream-paper">
      <Nav />
      <main>
        <Hero />
        <PrivacyBanner />
        <Dashboard />
        <Architecture />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
