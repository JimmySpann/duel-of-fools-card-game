import { useEffect } from 'react';
import RulesView from './RulesView';
import { DEFAULT_DEEP_SECTION_IDS, getRuleSections } from './rulesContent';
import './rules.css';

const RulesModal = ({
    onClose,
    title = 'Game Rules',
    sectionIds = DEFAULT_DEEP_SECTION_IDS,
}) => {
    const sections = getRuleSections(sectionIds);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div className="rules-modal-overlay" onClick={onClose}>
            <div className="rules-modal" onClick={(event) => event.stopPropagation()}>
                <div className="rules-modal-header">
                    <h2 className="rules-modal-title">{title}</h2>
                    <button className="rules-modal-close" onClick={onClose} aria-label="Close rules">✕</button>
                </div>

                <div className="rules-modal-nav" aria-label="Rules sections">
                    {sections.map((section) => (
                        <a key={section.id} href={`#rules-${section.id}`} className="rules-modal-chip">
                            {section.title}
                        </a>
                    ))}
                </div>

                <div className="rules-modal-body">
                    <RulesView mode="deep" sectionIds={sectionIds} />
                </div>
            </div>
        </div>
    );
};

export default RulesModal;
