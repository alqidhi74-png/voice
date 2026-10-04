import halfLogo from '../assets/hafl_no_background.png'

const Footer = () => {
  return (
    <footer className="bg-dark/80 border-t border-border/50 mt-auto backdrop-blur-sm">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <img 
              src={halfLogo} 
              alt="Voice Identity Shield Logo" 
              className="h-12 w-auto object-contain mb-4"
            />
            <p className="text-text-secondary text-sm leading-relaxed">
              Protecting your voice identity from AI impersonation attacks using advanced biometric authentication.
            </p>
          </div>
          
          <div>
            <h4 className="text-md font-semibold text-text-primary mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li><a href="/" className="hover:text-primary transition-colors rounded-lg px-2 py-1 inline-block hover:bg-primary/5">Home</a></li>
              <li><a href="/enroll" className="hover:text-primary transition-colors rounded-lg px-2 py-1 inline-block hover:bg-primary/5">Enroll Voice</a></li>
              <li><a href="/verify" className="hover:text-primary transition-colors rounded-lg px-2 py-1 inline-block hover:bg-primary/5">Verify Voice</a></li>
              <li><a href="/dashboard" className="hover:text-primary transition-colors rounded-lg px-2 py-1 inline-block hover:bg-primary/5">Dashboard</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-md font-semibold text-text-primary mb-4">Contact</h4>
            <p className="text-text-secondary text-sm leading-relaxed">
              University of Technology and Applied Sciences – Muscat
            </p>
            <p className="text-text-secondary text-sm mt-2 leading-relaxed">
              Cybersecurity | AI | Web Development | Voice Biometrics
            </p>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-border/50 text-center text-text-secondary text-sm">
          <p>© 2025 Voice Identity Shield. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer

