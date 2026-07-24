import { LoadingState } from "@sgc/ui";

export default function AppLoading() {
  return (
    <LoadingState
      label="Carregando área de trabalho"
      description="Estamos preparando os dados autorizados para o seu perfil."
      minHeight="24rem"
    />
  );
}
