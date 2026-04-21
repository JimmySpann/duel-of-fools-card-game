import { useSnackbar } from './SnackbarContext';

const Snackbar = () => {
    const { snack } = useSnackbar();
    if (!snack.msg) return null;
    return (
        <div className={`app-snack app-snack--${snack.type}`}>
            {snack.msg}
        </div>
    );
};

export default Snackbar;
