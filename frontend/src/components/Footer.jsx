import { Link } from "react-router-dom";
import { LEGAL_DOC_LIST } from "../data/legalDocs";
import { useLanguage } from "../context/LanguageContext";

export default function Footer() {
    const { t } = useLanguage();

    return (
        <footer className="glass-dark text-paper/70 mt-24">
            <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6 text-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="font-display italic text-paper text-lg">NEXORA</span>
                    </div>
                    <p>{t("footer.tagline")}</p>
                    <p className="text-paper/40">&copy; {new Date().getFullYear()} NEXORA</p>
                </div>

                <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-paper/10 pt-5 text-paper/60">
                    {LEGAL_DOC_LIST.map((d) => (
                        <Link key={d.slug} to={`/legal/${d.slug}`} className="hover:text-paper hover:underline">
                            {d.shortTitle}
                        </Link>
                    ))}
                </nav>
            </div>
        </footer>
    );
}
