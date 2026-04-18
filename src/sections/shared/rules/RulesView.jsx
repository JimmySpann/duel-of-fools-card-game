import { DEFAULT_BRIEF_SECTION_IDS, DEFAULT_DEEP_SECTION_IDS, getRuleSections } from './rulesContent';
import './rules.css';

const RulesView = ({
    mode = 'deep',
    sectionIds,
    className = '',
    showHeading = true,
}) => {
    const effectiveSectionIds = sectionIds || (mode === 'brief' ? DEFAULT_BRIEF_SECTION_IDS : DEFAULT_DEEP_SECTION_IDS);
    const sections = getRuleSections(effectiveSectionIds);

    return (
        <div className={`rules-content ${mode === 'brief' ? 'rules-content-brief' : 'rules-content-deep'} ${className}`.trim()}>
            {sections.map((section) => (
                <section key={section.id} id={`rules-${section.id}`} className="rules-section">
                    {showHeading && <h3 className="rules-section-title">{section.title}</h3>}

                    {Array.isArray(section.brief) && section.brief.length > 0 && (
                        <ul className="rules-list">
                            {section.brief.map((item, index) => (
                                <li key={`${section.id}-brief-${index}`}>{item}</li>
                            ))}
                        </ul>
                    )}

                    {mode === 'deep' && Array.isArray(section.steps) && section.steps.length > 0 && (
                        <ol className="rules-steps">
                            {section.steps.map((step, index) => (
                                <li key={`${section.id}-step-${index}`}>
                                    <strong>{step.title}</strong>
                                    <p>{step.detail}</p>
                                </li>
                            ))}
                        </ol>
                    )}

                    {mode === 'deep' && Array.isArray(section.deep) && section.deep.length > 0 && (
                        <div className="rules-paragraphs">
                            {section.deep.map((paragraph, index) => (
                                <p key={`${section.id}-deep-${index}`}>{paragraph}</p>
                            ))}
                        </div>
                    )}

                    {mode === 'deep' && Array.isArray(section.bullets) && section.bullets.length > 0 && (
                        <ul className="rules-sublist">
                            {section.bullets.map((item, index) => (
                                <li key={`${section.id}-sub-${index}`}>{item}</li>
                            ))}
                        </ul>
                    )}
                </section>
            ))}
        </div>
    );
};

export default RulesView;
