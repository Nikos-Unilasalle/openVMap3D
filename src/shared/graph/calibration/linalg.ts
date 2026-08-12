/**
 * The small dense-linear-algebra kernel the DLT calibration needs, written
 * out rather than pulled in as a dependency: it is three routines (symmetric
 * eigen-decomposition, its smallest-eigenvector corollary, and a 3x3 RQ
 * factorization), all textbook, all covered by tests here. three.js's math
 * classes stop at 4x4 and don't do eigen/RQ at all, and the DLT's design
 * matrix is 12x12 — so there was nothing to reuse.
 */

export type Mat = number[][];

export function identity(n: number): Mat {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

export function transpose(a: Mat): Mat {
  return a[0].map((_, j) => a.map((row) => row[j]));
}

export function multiply(a: Mat, b: Mat): Mat {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0].length;
  const out: Mat = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < cols; j++) out[i][j] += aik * b[k][j];
    }
  }
  return out;
}

export function determinant3(m: Mat): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

export function invert3(m: Mat): Mat | null {
  const det = determinant3(m);
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  return [
    [
      (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * inv,
      (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * inv,
      (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * inv,
    ],
    [
      (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * inv,
      (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * inv,
      (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * inv,
    ],
    [
      (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * inv,
      (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * inv,
      (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * inv,
    ],
  ];
}

const JACOBI_MAX_SWEEPS = 100;
const JACOBI_OFF_DIAGONAL_TOLERANCE = 1e-22;
const JACOBI_SKIP_TOLERANCE = 1e-18;

/**
 * Cyclic Jacobi eigen-decomposition for a symmetric matrix. Returns
 * eigenvalues and the matrix whose *columns* are the matching eigenvectors,
 * orthonormal by construction. Chosen over a general SVD because the only
 * thing the DLT needs is the null direction of A^T A, which is symmetric —
 * and Jacobi on a symmetric matrix is both far shorter to write and more
 * numerically forgiving than a general SVD on the 2n x 12 design matrix.
 */
export function jacobiEigenSymmetric(input: Mat): { values: number[]; vectors: Mat } {
  const n = input.length;
  const a = input.map((row) => [...row]);
  const v = identity(n);

  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS; sweep++) {
    let offDiagonal = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) offDiagonal += a[p][q] * a[p][q];
    }
    if (offDiagonal < JACOBI_OFF_DIAGONAL_TOLERANCE) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < JACOBI_SKIP_TOLERANCE) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        // Math.sign(0) is 0, which would collapse the rotation to nothing —
        // fall back to +1 for the theta === 0 case.
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        // A <- J^T A J, applied as (A J) then (J^T .), plus V <- V J
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  return { values: a.map((row, i) => row[i]), vectors: v };
}

/** The eigenvector of the smallest eigenvalue — i.e. the least-squares null direction, which is what a homogeneous system like the DLT's actually solves for. */
export function smallestEigenvector(a: Mat): number[] {
  const { values, vectors } = jacobiEigenSymmetric(a);
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[best]) best = i;
  }
  const column = vectors.map((row) => row[best]);
  const norm = Math.hypot(...column);
  return norm === 0 ? column : column.map((x) => x / norm);
}

function givensApply(m: Mat, g: Mat): Mat {
  return multiply(m, g);
}

/**
 * RQ factorization of a 3x3: M = R * Q with R upper triangular and Q a
 * rotation. This is the step that splits a camera's 3x4 projection matrix
 * into "what the lens does" (R, the intrinsics — focal lengths and the
 * principal point, i.e. the projector's lens shift) and "where the camera
 * is pointing" (Q, the rotation). Three Givens rotations zero the lower
 * triangle in turn; the diagonal is then sign-fixed positive, since a
 * negative focal length is a factorization artefact, not a real camera.
 */
export function rq3(m: Mat): { r: Mat; q: Mat } {
  let r = m.map((row) => [...row]);

  const hypotOrIdentity = (y: number, x: number, negateCos: boolean) => {
    const d = Math.hypot(y, x);
    if (d === 0) return { c: 1, s: 0 };
    return { c: (negateCos ? -y : y) / d, s: x / d };
  };

  // Rotation about x zeroes r[2][1]
  const { c: cx, s: sx } = hypotOrIdentity(r[2][2], r[2][1], true);
  const qx = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  r = givensApply(r, qx);

  // Rotation about y zeroes r[2][0]
  const { c: cy, s: sy } = hypotOrIdentity(r[2][2], r[2][0], false);
  const qy = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  r = givensApply(r, qy);

  // Rotation about z zeroes r[1][0]
  const { c: cz, s: sz } = hypotOrIdentity(r[1][1], r[1][0], true);
  const qz = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];
  r = givensApply(r, qz);

  let q = multiply(multiply(transpose(qz), transpose(qy)), transpose(qx));

  // Sign fix: force a positive diagonal on R. Negating column i of R and row
  // i of Q leaves the product R*Q untouched (the two sign flips cancel).
  for (let i = 0; i < 3; i++) {
    if (r[i][i] >= 0) continue;
    for (let k = 0; k < 3; k++) {
      r[k][i] = -r[k][i];
      q[i][k] = -q[i][k];
    }
  }

  // A reflection is not a camera orientation — flipping both factors keeps
  // the product intact while turning Q back into a proper rotation.
  if (determinant3(q) < 0) {
    r = r.map((row) => row.map((x) => -x));
    q = q.map((row) => row.map((x) => -x));
  }

  return { r, q };
}
