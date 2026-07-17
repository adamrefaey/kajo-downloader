interface InlineErrorProps {
    message: string;
}

function InlineError({ message }: InlineErrorProps): React.JSX.Element {
    return (
        <p className="inline-error" role="alert">
            {message}
        </p>
    );
}

export default InlineError;
