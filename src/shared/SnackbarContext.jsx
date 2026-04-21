import { createContext, useCallback, useContext, useRef, useState } from 'react';

const SnackbarContext = createContext(null);

export const SnackbarProvider = ({ children }) => {
    const [snack, setSnack] = useState({ msg: '', type: 'info' });
    const timerRef = useRef(null);

    const showSnack = useCallback((msg, type = 'info', duration = 3000) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setSnack({ msg, type });
        timerRef.current = setTimeout(() => setSnack({ msg: '', type: 'info' }), duration);
    }, []);

    return (
        <SnackbarContext.Provider value={{ snack, showSnack }}>
            {children}
        </SnackbarContext.Provider>
    );
};

export const useSnackbar = () => {
    const ctx = useContext(SnackbarContext);
    if (!ctx) throw new Error('useSnackbar must be used inside SnackbarProvider');
    return ctx;
};
