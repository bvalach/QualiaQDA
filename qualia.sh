#!/bin/bash
# QualiaQDA — script de inicio

DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="/tmp/qualia_venv"
BACKEND_URL="http://127.0.0.1:8001/api/health"

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
}

wait_for_backend() {
  local attempts=30

  for ((i=1; i<=attempts; i++)); do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      echo "El backend se cerró durante el arranque."
      return 1
    fi

    if curl -fsS "$BACKEND_URL" >/dev/null 2>&1; then
      return 0
    fi

    sleep 1
  done

  echo "El backend no respondió en $BACKEND_URL tras ${attempts}s."
  return 1
}

# Crear venv si no existe
if [ ! -d "$VENV" ]; then
  echo "Creando entorno virtual en $VENV..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$DIR/backend/requirements.txt"
fi

# Instalar dependencias si faltan (por si el venv se recreó sin ellas)
if ! "$VENV/bin/python" -c "import uvicorn" 2>/dev/null; then
  echo "Instalando dependencias..."
  "$VENV/bin/pip" install -q -r "$DIR/backend/requirements.txt"
fi

# Matar procesos previos en los puertos
lsof -ti:8001 | xargs kill 2>/dev/null
lsof -ti:5173 | xargs kill 2>/dev/null

# Backend
echo "Arrancando backend en :8001..."
cd "$DIR/backend"
"$VENV/bin/uvicorn" qualia.main:app --port 8001 &
BACKEND_PID=$!

if ! wait_for_backend; then
  cleanup
  exit 1
fi

# Frontend
echo "Arrancando frontend en :5173..."
cd "$DIR/frontend"
[ ! -d node_modules ] && npm install
npm run build >/dev/null || exit 1
npm run preview -- --host 127.0.0.1 --port 5173 &
FRONTEND_PID=$!

echo ""
echo "QualiaQDA corriendo:"
echo "  Frontend → http://127.0.0.1:5173"
echo "  Backend  → http://localhost:8001"
echo ""
echo "Ctrl+C para parar ambos."

trap "cleanup; exit" INT TERM EXIT
wait
