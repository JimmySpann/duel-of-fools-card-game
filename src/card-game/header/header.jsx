import './header.css'

const Header = ({ }) => {

    return (
        <div className="header-container">
            <h2 className="header-title">
                Card Game
            </h2>
            <button
                className="button"
            // onClick={onFlipAllCards}
            >
                Flip All Cards
            </button>
        </div>
    );
}

export default Header;