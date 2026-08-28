import { Link } from "react-router-dom";
import { BackArrowIcon } from "./Icons";

// Standalone "feature not live yet" screen. Currently only used for the
// disabled Services department (Part of the Services/Dark-Mode/
// Deletion plan - see DepartmentPage.jsx), kept generic (title/description
// props) in case another department needs the same treatment later.
export default function ComingSoon({
    title = "Services",
    description = "We're redesigning this department to make finding and booking local services easier. Check back soon."
}) {
    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 py-16">
            <div className="max-w-md w-full text-center animate-fade-in">
                <div className="relative mx-auto mb-6 w-24 h-24 animate-float">
                    <div className="absolute inset-0 rounded-full bg-teal/15" />
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="absolute inset-0 m-auto w-11 h-11 text-teal"
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M12 7v5l3.2 1.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                <span className="inline-block text-[10px] uppercase tracking-wide font-semibold text-teal bg-teal/10 rounded-full px-3 py-1 mb-4 animate-pop-in">
                    Coming soon
                </span>

                <h1 className="font-display text-2xl sm:text-3xl text-ink mb-2 animate-slide-up">
                    {title}
                </h1>
                <p className="text-ash text-sm leading-relaxed mb-8 animate-slide-up" style={{ animationDelay: "80ms" }}>
                    {description}
                </p>

                <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-frost bg-teal hover:bg-teal/90 transition-colors rounded-lg px-5 py-2.5 animate-slide-up"
                    style={{ animationDelay: "140ms" }}
                >
                    <BackArrowIcon className="w-4 h-4" /> Explore other departments
                </Link>
            </div>
        </div>
    );
}
