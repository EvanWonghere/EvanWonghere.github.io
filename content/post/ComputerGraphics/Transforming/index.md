---
title: "Computer Graphics — Transforming"
description: 
date: 2026-04-26T18:16:00+08:00
image: "cover.png"
math: true
tags: ["ComputerGraphics", "计算机图形学","LinearAlgebra","线性代数","LearningNote", "学习笔记"]
categories: ["学习笔记"]
series: ["计算机图形学"] 
hidden: false
comments: true
draft: false
---

# Computer Graphics — Transforming

[TOC]

## 2D Transforming

### Scale

对于一个 2D 空间的缩放，我们可以认为所有的横 X 坐标都变为了原来的 \(s_x\) 倍，所有的纵坐标 Y 都变为原来的 \(s_y\) 倍。也就是说我们定义一个缩放函数 \(scale(s_x, s_y, x, y)\)，那么有：

<div class="math-display">
$$
scale(s_x, s_y, x, y) =
\begin{bmatrix}
s_x & 0 \\
0 & s_y
\end{bmatrix}
\begin{bmatrix}
x \\
y
\end{bmatrix}
=
\begin{bmatrix}
s_xx \\
s_yy
\end{bmatrix}
$$
</div>

### Rotate

对于一个二维平面上的点 \(A(x_a, y_a)\)，我们将其旋转 \(\phi\) 角度到点 \(B(x_b, y_b)\)。不妨设线段 \(OA\) 与横坐标轴的夹角为 \(\alpha\)，长度为 \(r\)，于是有：

<div class="math-display">
$$
\begin{cases}
r = \sqrt{x_a^2 + y_a^2} \\
x_a = r\cos\alpha \\
y_a = r\sin\alpha \\
x_b = r\cos(\alpha+\phi) = r\cos\alpha\cos\phi - r\sin\alpha\sin\phi = x_a\cos\phi - y_a\sin\phi \\
y_b = r\sin(\alpha+\phi) = r\cos\alpha\sin\phi + r\sin\alpha\cos\phi = x_a\sin\phi + x_a\cos\phi \\
\end{cases}
$$
</div>

由此我们可以定义一个旋转函数 \(rotate(x, y, \phi)\)，那么有：

<div class="math-display">
$$
rotate(x, y, \phi) =
\begin{bmatrix}
\cos\phi & -\sin\phi \\
\sin\phi & \cos\phi
\end{bmatrix}
\begin{bmatrix}
x \\
y
\end{bmatrix}
=
\begin{bmatrix}
x\cos\phi - y\sin\phi \\
x\sin\phi + x\cos\phi
\end{bmatrix}
$$
</div>

### Shear

Shear 剪切是一种仿射变换，它将每个点沿固定方向移动，移动量与其到给定直线的有符号距离成正比，该直线平行于该方向。在平面 \(\mathbb{R}^{2}=\mathbb{R} \times \mathbb{R}\) 中，水平剪切（或沿 x 轴的剪切）是一个函数，它将具有坐标 \((x, y)\)  的任意点映射到点 \((x+my, y)\) ；其中 \(m\) 是一个固定参数，称为剪切因子。

故我们可以定义两个剪切函数 \(shear_x(x, y, m), shear_y(x, y, m)\)，那么有：

<div class="math-display">
$$
shear_x(x, y, m) =
\begin{bmatrix}
1 & m \\
0 & 1
\end{bmatrix}
\begin{bmatrix}
x \\
y
\end{bmatrix}
=
\begin{bmatrix}
x + my \\
y
\end{bmatrix}
\\
shear_y(x, y, m) = 
\begin{bmatrix}
1 & 0 \\
m & 1
\end{bmatrix}
\begin{bmatrix}
x \\
y
\end{bmatrix}
=
\begin{bmatrix}
x \\
mx + y
\end{bmatrix}
$$
</div>

有一点有趣的地方在于，可以通过切变来得到旋转:

<div class="math-display">
$$
\begin{align}
rotate(\phi) &= 
\begin{bmatrix}
\cos\phi & -\sin\phi \\
\sin\phi & \cos\phi
\end{bmatrix} \\
&=
\begin{bmatrix}
1 & \frac{\cos\phi-1}{\sin\phi} \\
0 & 1
\end{bmatrix}
\begin{bmatrix}
1 & 0 \\
\sin\phi & 1
\end{bmatrix}
\begin{bmatrix}
1 & \frac{\cos\phi-1}{\sin\phi} \\
0 & 1
\end{bmatrix} \\
&= shear_x(\frac{\cos\phi-1}{\sin\phi}) \ shear_y(\sin\phi) \ shear_x(\frac{\cos\phi-1}{\sin\phi})
\end{align}
$$
</div>

这意味着任何二维平面上的旋转都可以等同为三次对应切变。

### Reflect

反射变换，或者叫翻转变换，实际上就是 \(-1\) 倍的缩放变换。但是注意只能翻转一个轴，否则的话就等同于旋转了。

### Composition and Decomposition

#### Composition

注意到以上变换都可以使用二维矩阵表示，于是连续的变换就可以通过矩阵乘法表现出来，例如：

<div class="math-display">
$$
\begin{align}
&scale(0.5, 0.5) \text{ then } rotate(\frac{\pi}{4})\\
&=
\begin{bmatrix}
\cos\frac{\pi}{4} & -\sin\frac{\pi}{4} \\
\sin\frac{\pi}{4} & \cos\frac{\pi}{4}
\end{bmatrix}
\begin{bmatrix}
0.5 & 0 \\
0 & 0.5
\end{bmatrix}
\begin{bmatrix}
x \\
y
\end{bmatrix}
\\
&=
\begin{bmatrix}
\frac{\sqrt{2}}{4} & -\frac{\sqrt{2}}{4} \\
\frac{\sqrt{2}}{4} & \frac{\sqrt{2}}{4}
\end{bmatrix}
\begin{bmatrix}
x \\
y
\end{bmatrix}
\\
&=
\begin{bmatrix}
\frac{\sqrt{2}}{4}x - \frac{\sqrt{2}}{4}y \\
\frac{\sqrt{2}}{4}x + \frac{\sqrt{2}}{4}y
\end{bmatrix}
\end{align}
$$
</div>

需要注意的在于，根据矩阵乘法的定义，变换应该按顺序左乘，也就是按照变换顺序从右往左写变换矩阵。

还有一点就是，矩阵乘法具有结合律，因此我们可以先将所有变换矩阵相乘，得到混合的、总的变换矩阵。

#### Decomposition

既然变换矩阵是可以组合在一起呢，那么给出一个组合起来的矩阵，我们如何知道进行了哪些变换呢？

假设有线性变换核心矩阵 \(A\)：

<div class="math-display">
$$
A = \begin{bmatrix} m_{00} & m_{01} \\ m_{10} & m_{11} \end{bmatrix}
$$
</div>


根据不同的数学原理和应用场景，有以下五种核心的分解方法：

1. **直接代数提取法 (Direct TRS Extraction)**

这是游戏引擎中最基础、计算性能最高的方法，前提是**假设矩阵不包含错切（Shear）**。

- **提取逻辑**（列向量标准下）：

  - **缩放 (Scale)**：基向量的模长。

    <div class="math-display">
    $$
    Scale_x = \sqrt{m_{00}^2 + m_{10}^2}, \quad Scale_y = \sqrt{m_{01}^2 + m_{11}^2}
    $$
    </div>
    
  - **旋转 (Rotation)**：归一化基向量后，通过反三角函数求角。

    <div class="math-display">
    $$
    \theta = \text{atan2}(m_{10}, m_{00})
    $$
    </div>
    
  
- **局限性**：如果经过非等比缩放后再旋转（产生错切），或者存在镜像（负缩放），直接提取会导致结果错误。

- **应用场景**：常规 Transform 组件的 TRS 参数同步与重构。



2. **QR 分解 (QR Decomposition)**

将矩阵分解为一个正交矩阵 \(Q\) 和一个上三角矩阵 \(R\)：

<div class="math-display">
$$
A = Q \cdot R
$$
</div>

- **几何意义**：
  - \(Q\)（正交矩阵）：代表**旋转**（可能含镜像）。
  - \(R\)（上三角矩阵）：代表**缩放和错切**。
  - 操作顺序等价于：**先缩放，再错切，最后旋转**。
- **应用场景**：UI 动画系统（如 CSS3 / SVG Matrix 规范），需要精确剥离并处理错切参数的场景。



3. **极分解 (Polar Decomposition)**

将矩阵分解为一个正交矩阵 \(U\) 和一个对称半正定矩阵 \(P\)：

<div class="math-display">
$$
A = U \cdot P
$$
</div>


- **几何意义**：
  - \(U\)（正交矩阵）：代表最近似的纯刚体**旋转**。
  - \(P\)（对称矩阵）：代表所有的非刚体形变（**拉伸与错切**）。
- **应用场景**：**骨骼动画系统与矩阵插值**。剥离出纯旋转进行球面线性插值（Slerp），形变部分进行线性插值（Lerp），能有效防止动画过渡时出现诡异的体积扭曲。



4. **奇异值分解 (SVD, Singular Value Decomposition)**

最彻底、最具普适性的代数分解方法。任何实矩阵皆可分解：

<div class="math-display">
$$
A = U \cdot \Sigma \cdot V^T
$$
</div>

- **几何意义**：
  - \(V^T\)：第一次**局部旋转**。
  - \(\Sigma\)（对角矩阵）：沿着局部坐标轴的**非等比缩放**。
  - \(U\)：第二次**全局旋转**。
  - 操作顺序等价于：转到一个特定角度 \(\rightarrow\) 沿 XY 轴正交拉伸 \(\rightarrow\) 再转到一个新角度。
- **应用场景**：物理引擎碰撞与形变处理、病态矩阵求逆、高级数学分析。



5. **特征分解 / 谱分解 (Eigendecomposition)**

将矩阵分解为旋转、对角缩放、逆旋转：

<div class="math-display">
$$
A = R \cdot S \cdot R^T
$$
</div>

- **先决条件**：矩阵 \(A\) 必须是**对称矩阵**（\(A = A^T\)），即不包含全局旋转。
- **几何意义**：
  - \(R^T\)：将受力方向对齐到局部坐标轴。
  - \(S\)：在局部空间进行纯对角缩放（特征值即缩放比例）。
  - \(R\)：旋转回世界空间。
  - 本质是**局部坐标系下的非等比缩放**。
- **应用场景**：作为 SVD 和极分解的底层推导（例如对极分解中的形变矩阵 \(P\) 求解具体拉伸轴向），以及碰撞检测中的 OBB（方向包围盒）协方差矩阵分析。

| **分解方法**       | **公式**          | **提取出的几何分量**   | **核心应用领域**                           |
| ------------------ | ----------------- | ---------------------- | ------------------------------------------ |
| **直接法 (TRS)**   | 代数公式          | 缩放、旋转             | 游戏对象基础变换，逻辑层 Transform 同步    |
| **QR 分解**        | \(A = QR\)          | 旋转、缩放、错切       | 前端渲染、带错切的 2D UI 变形动画          |
| **极分解 (Polar)** | \(A = UP\)          | 刚体旋转、拉伸形变     | 骨骼蒙皮、消除扭曲的矩阵平滑插值           |
| **SVD**            | \(A = U\Sigma V^T\) | 旋转1、轴向缩放、旋转2 | 物理引擎形变计算、高鲁棒性底层算法         |
| **特征分解**       | \(A = RSR^T\)       | 局部轴向缩放           | 仅限对称矩阵，用于解析形变轴向、包围盒生成 |

### Translation

Translation 平移是很简单的变换，但也是最特殊的变换，因为它并不是平移变换。我们定义一个平移函数 \(translation(x, y, dx, dy)\)，有：

<div class="math-display">
$$
translation(x, y, dx, dy) = (x+dx, y+dy)
$$
</div>

由于并不是线性变换，因此无法使用同纬度的矩阵来表示，这就意味着无法把所有变换合并成一个单一的变换矩阵

吗？

### Transformation Matrix

#### Translation Matrix?

为了解决将所有变换都合并起来的问题，数学家们使用了一个很 tricky 的方法：

引入齐次坐标，通过升维操作，将二维的平移转换成三维的错切 shear，具体来说是，我们将一个二维点坐标 \((x, y)\) 补充一个 \(w\) 分量，升维成使用三维向量 \([x \ y \ w]^T\) 表示。为了方便起见一般设 \(w=1\)，并且约定 \(w \neq 0\) 时 \([\frac{x}{w} \ \frac{y}{w} \ 1]^T\) 与 \([x \ y \ w]\) 表示的是同一个点；\(w = 0\) 时我们则认为表示的就是一个向量，而不是一个点，这么做的原因是确保二维向量经过平移变换后仍然是不变的，这一点将在后面证明。

想象一个左下角在原点、两条边紧贴横轴与纵轴的矩形。在二维 Shear 变换中，我们将每个点沿一个固定方向移动，不妨设为纵轴正方向。我们可以得知：紧贴着纵轴的边是不变的，与纵轴平行的边依旧平行且长度不变。这在直觉上相当于：这条边沿着纵轴正方向**平移**了！

我们可以从坐标变换中更清晰地看出这一点：

<div class="math-display">
$$
\begin{bmatrix} 1 & 0 \\ k & 1 \end{bmatrix} \begin{bmatrix} x \\ y \end{bmatrix} = \begin{bmatrix} x \\ kx + y \end{bmatrix}
$$
</div>

对于一条平行于 \(y\) 轴的直线 \(x=c\)，其线上的点在 shear 变换后的坐标为 \(\begin{bmatrix} c & kc + y \end{bmatrix}^T\)，对于这条线段本身而言，它的 \(x\) 坐标没变，形状没变，只是整体在 \(y\) 轴上增加了 \(kc\) 的距离。**在它的 1D 视角里，它确确实实只是做了一次一维平移**。

于是，我们将这个思想继续应用到三维 shear，如果我们以 **\(z = 0\) 平面为固定底座**进行三维 shear，那么在 **\(z = w\) 这个截面上**，我们看到的就应该是 2D 图形的大小形状不变，且整体进行着平移变换！因此我们可以反推出变换矩阵，我们目前坐标为 \((x, y, w)^T\)，期望平移变换到点 \((x+t_x, y+t_y, w)^T\) 上，不难推出该变换矩阵：

<div class="math-display">
$$
\begin{bmatrix}
1 & 0 & t_x \\
0 & 1 & t_y \\
0 & 0 & 1
\end{bmatrix}
\begin{bmatrix}
x \\
y \\
w
\end{bmatrix}
=
\begin{bmatrix}
x + t_xw \\
y + t_yw \\
w
\end{bmatrix}
$$
</div>

只要我们令 \(w = 1\)，那么 \(t_x, t_y\) 就直接是对应的偏移量了，这也是前面说的“一般设 \(w=1\)”的原因。此外这还能解释为什么“\(w = 0\) 时我们则认为表示的就是一个向量”，因为此时变换前后的坐标值并没有变化，这正符合**向量的平移不变性**！

#### Transformation Matrix!

我们虽然成功将 Translation 变换使用矩阵表示了出来，但是Translation 变换要使用三维矩阵，其他的线性变换却都是二维矩阵，这意味着无法通过矩阵乘法将它们进行结合。

然而若使用分块矩阵的思想，这个问题其实不难解决，我们将 Translation 变换矩阵进行分块可以得到：

<div class="math-display">
$$
\left[
\begin{array}{cc|c}
  1 & 0 & tx \\
  0 & 1 & ty \\
  \hline
  0 & 0 & 1
\end{array}
\right]
$$
</div>

按从左上到右下的顺序，以此命名为区域 \(I, II, III, IV\)。区域 \(III, IV\) 我们可以先不管（*区域 III \(\begin{bmatrix} 0 & 0 \end{bmatrix}\) 代表了**投影分量（Projection）**。正是因为它严格为 \(\begin{bmatrix} 0 & 0 \end{bmatrix}\)，才保证了变换后的 \(w\) 依然是 \(1\)；区域 IV 的 \(1\) 代表全局缩放系数，如果不为 \(1\)，整个坐标系会被等比放大或缩小*）。区域 \(II\) 表示的是平移偏移量，注意到区域 \(I\) 正好是 Identity Matrix，如果我们只看这一部分，那么其对二维上的点的影响是什么呢？我们将区域 \(I\) 替换成 \(\begin{bmatrix} a & b \\ c & d \end{bmatrix}\)，代入矩阵乘法中得到：

<div class="math-display">
$$
\begin{bmatrix}
a & b & t_x \\
c & d & t_y \\
0 & 0 & 1
\end{bmatrix}
\begin{bmatrix}
x \\
y \\
w
\end{bmatrix}
=
\begin{bmatrix}
ax + by + t_xw \\
cx + dy + t_yw \\
w
\end{bmatrix}
$$
</div>

不难注意到区域 \(I\) 代表的正是对 \((x, y)\) 进行线性变换！也就是说，我们完全可以将区域 \(I\) 替换成先前的聚合变换矩阵！这样修改后的矩阵的作用相当于**先进行线性变换，再进行平移变换**，这样问题便解决了，解决的办法就是通过一个矩阵将线性变换和平移结合起来，并且这样得到的矩阵本身是可以再聚合的。

最终我们得到的同时包含了线性映射与平移的矩阵，我们称之为 Affine Transformation Matrix（仿射变换矩阵），而区域 \(I\) 称为线性变换区域，区域 \(II\) 称为平移变换区域，区域 \(III, IV\) 在实际存储中可以省略（恒为 \(\begin{bmatrix} 0 & 0 & 1 \end{bmatrix}\)），使用时再补齐。

## 3D Transforming

在充分理解了 2D 变换的基础上，3D 变换并不难理解，其实基本相同。

### Scale

<div class="math-display">
$$
scale(s_x, s_y, s_z) =
\begin{bmatrix}
s_x & 0 & 0 \\
0 & s_y & 0 \\
0 & 0 & s_z
\end{bmatrix}
$$
</div>

### Rotation

<div class="math-display">
$$
rotate_z(\phi) =
\begin{bmatrix}
\cos\phi & -\sin\phi & 0 \\
\sin\phi & \cos\phi & 0 \\
0 & 0 & 1
\end{bmatrix}
\\ \\
rotate_x(\phi) =
\begin{bmatrix}
1 & 0 & 0 \\
0 & \cos\phi & -\sin\phi \\
0 & \sin\phi & \cos\phi
\end{bmatrix}
\\ \\
rotate_y(\phi) =
\begin{bmatrix}
\cos\phi & 0 & \sin\phi \\
0 & 1 & 0 \\
-\sin\phi & 0 & \cos\phi
\end{bmatrix}
$$
</div>

注意到绕 \(y\) 轴旋转似乎有些特殊，其旋转分量拆分出来是 \(\begin{bmatrix} cos\phi & \sin\phi \\ -\sin\phi & \cos\phi \end{bmatrix}\)，按另外的都是 \(\begin{bmatrix} cos\phi & -\sin\phi \\ \sin\phi & \cos\phi \end{bmatrix}\)，这实际上是旋转对称性带来的错觉。我们将点 \((x, y, z)^T\) 变换后的坐标分别写出来，得到：

<div class="math-display">
$$
\begin{bmatrix}
x\cos\phi - y\sin\phi \\
x\sin\phi + y\cos\phi \\
z
\end{bmatrix},
\begin{bmatrix}
x \\
y\cos\phi - z\sin\phi \\
y\sin\phi + z\cos\phi \\
\end{bmatrix},
\begin{bmatrix}
x\cos\phi + z\sin\phi \\
y \\
-x\sin\phi + z\cos\phi \\
\end{bmatrix}
$$
</div>

可以看出其形式是完全相同的，只是我们在写的时候由于 \(x\) 分量在上，因此要将 \(x\) 项提前，因此破坏了轮转。

然而现在的旋转只能局限于坐标轴的三个方向，如果我希望绕着任意一个方向向量旋转呢？**罗德里格斯旋转公式（Rodrigues' Rotation Formula）**将给你答案，下面我们进行该公式的推导。

首先先明确我们的问题，给定空间中任意一个单位向量作为旋转轴 \(\mathbf{u}\)，以及一个旋转角度 \(\phi\)，要求计算出空间中任意一点（或向量）\(\mathbf{v}\) 绕该轴旋转后的新位置 \(\mathbf{v}'\)。

我们首先将目标向量 \(\mathbf{v}\) 分解为平行于旋转轴 \(\mathbf{u}\) 的分量 \(\mathbf{v}_{\parallel}\) 和 垂直的分量 \(\mathbf{v}_{\perp}\)，这是因为平行分量再旋转后是不变的，因此后续只需要讨论垂直分量。平行分量可以通过点乘得到，而垂直分量可以通过作差得到：

<div class="math-display">
$$
\mathbf{v}_{\parallel} = (\mathbf{v} \cdot \mathbf{u})\mathbf{u} \\
\mathbf{v}_{\perp} = \mathbf{v} - \mathbf{v}_{\parallel} = \mathbf{v} - (\mathbf{v} \cdot \mathbf{u})\mathbf{u} = -\mathbf{u} \times (\mathbf{u} \times \mathbf{v})
$$
</div>

表示出来了之后，我们开始考垂直分量 \(\mathbf{v}_{\perp}\) 的旋转，由于其与旋转轴 \(\mathbf{u}\) 相互垂直，那么其旋转实际上就是垂直平面上的二维旋转，为了描述这个垂直平面，我们还需要一个基向量 

<div class="math-display">
$$
\mathbf{w} = \mathbf{u} \times \mathbf{v} = \mathbf{u} \times (\mathbf{v}_{\parallel} + \mathbf{v}_{\perp}) = \mathbf{u} \times \mathbf{v}_{\parallel} + \mathbf{u} \times \mathbf{v}_{\perp} = \mathbf{u} \times \mathbf{v}_{\perp}
$$
</div>

由于 \(\mathbf{v}_{\perp}\) 和 \(\mathbf{w}\) 就是垂直平面的基向量，且 \(||\mathbf{w}|| = ||\mathbf{u} \times \mathbf{v}_{\perp}|| = ||\mathbf{u}|| \cdot ||\mathbf{v}_{\perp}|| \cdot \sin\frac{\pi}{2} = ||\mathbf{v}_{\perp}||\)，因此我们很容易可以得到 \(\mathbf{v}_{\perp}\) 旋转后的向量为：

<div class="math-display">
$$
\mathbf{v}_{\perp}' = \cos\phi \cdot \mathbf{v}_{\perp} + \sin\phi \cdot \mathbf{w}
$$
</div>

现在只要再加上平行分量  \(\mathbf{v}_{\parallel}\) 就能得到旋转后的最终向量：

<div class="math-display">
$$
\begin{align}
\mathbf{v}' &= \mathbf{v}_{\parallel}' + \mathbf{v}_{\perp}' \\
&= \mathbf{v}_{\parallel} + \cos\phi \cdot \mathbf{v}_{\perp} + \sin\phi \cdot \mathbf{w} \\
&= (\mathbf{v} \cdot \mathbf{u})\mathbf{u} + \cos\phi \cdot (\mathbf{v} - (\mathbf{v} \cdot \mathbf{u})\mathbf{u}) + \sin\phi \cdot (\mathbf{u} \times \mathbf{v}) \\
&= \cos\phi \cdot \mathbf{v} + (1 - \cos\phi)(\mathbf{u} \cdot \mathbf{v})\mathbf{u} + \sin\phi \cdot (\mathbf{u} \times \mathbf{v}) \\
&= \left(\cos\phi \cdot I + (1 - \cos\phi)\mathbf{u}\mathbf{u}^T + \sin\phi \cdot \begin{bmatrix} 0 &-u_z &u_y \\ u_z &0 &-u_x \\ -u_y &u_x &0 \end{bmatrix}\right)\mathbf{v}
\end{align}
$$
</div>

还有别的表示方法，比如令 \(U = \begin{bmatrix} 0 &-u_z &u_y \\ u_z &0 &-u_x \\ -u_y &u_x &0 \end{bmatrix}\)，于是有 \(\mathbf {u} \times \mathbf {v} =\mathbf {U} \mathbf {v} ,\quad \mathbf {u} \times (\mathbf {u} \times \mathbf {v} )=\mathbf {U} (\mathbf {U} \mathbf {v} )=\mathbf {U} ^{2}\mathbf {v}\)。将表达式重新推导下：

<div class="math-display">
$$
\begin{align}
\mathbf{v}' &= \mathbf{v}_{\parallel}' + \mathbf{v}_{\perp}' \\
&= \mathbf{v}_{\parallel} + \cos\phi \cdot \mathbf{v}_{\perp} + \sin\phi \cdot \mathbf{w} \\
&= (\mathbf{v} \cdot \mathbf{u})\mathbf{u} + \cos\phi \cdot (\mathbf{v} - (\mathbf{v} \cdot \mathbf{u})\mathbf{u}) + \sin\phi \cdot (\mathbf{u} \times \mathbf{v}) \\
&= \cos\phi \cdot \mathbf{v} + (1 - \cos\phi)(\mathbf{u} \cdot \mathbf{v})\mathbf{u} + \sin\phi \cdot (\mathbf{u} \times \mathbf{v}) \\
&// \ \text{Simplified Using Vector Triple Product} \\
&= \mathbf{v} + \sin\phi(\mathbf{u} \times \mathbf{v}) + (1-\cos\phi) \mathbf{u} \times (\mathbf{u} \times \mathbf{v}) \\
&= \mathbf{v} +(\sin\phi)\mathbf{U}\mathbf{v} + (1-\cos\phi)\mathbf{U}^{2}\mathbf{v} \\
&= \mathbf{Rv}
\end{align}
$$
</div>

其中 \(\mathbf{R}\) 就是常用的旋转矩阵：

<div class="math-display">
$$
\mathbf{R} =\mathbf{I} + (\sin\phi)\mathbf{U} + (1-\cos\phi)\mathbf{U}^{2}
$$
</div>

### Shear

三维切变变换实际上在上一节中平移变换推导中提到了，这里只给出沿轴的变换矩阵。

<div class="math-display">
$$
shear_x(dy, dz) =
\begin{bmatrix}
1 & dy & dz \\
0 & 1 & 0 \\
0 & 0 & 1
\end{bmatrix}
\\ \\
shear_y(dx, dz) =
\begin{bmatrix}
1 & 0 & 0 \\
dx & 1 & dz \\
0 & 0 & 1
\end{bmatrix}
\\ \\
shear_z(dx, dy) =
\begin{bmatrix}
1 & 0 & 0 \\
0 & 1 & 0 \\
dx & dy & 1
\end{bmatrix}
$$
</div>

### Translation

<div class="math-display">
$$
translation(t_x, t_y, t_z) =
\begin{bmatrix}
1 & 0 & 0 & t_x \\
0 & 1 & 0 & t_y \\
0 & 0 & 1 & t_z \\
0 & 0 & 0 & 1 \\
\end{bmatrix}
$$
</div>

### Extra

现在考虑一个问题，对于一个物体，使其绕着空间中某一条直线旋转特定角度，如何使用 transformation matrix 来表示呢？

我们先前讨论的旋转，一开始都是以某个坐标轴为旋转轴进行的，后来经过拓展我们可以绕过原点的任意轴进行旋转。因此若对于任意的旋转轴，只要我们能够将旋转轴经过原点就好了。顺着这样思路下去，只要我们将旋转轴平移到穿过原点，再对物体进行旋转，在平移变换过程中，需要旋转的物体跟着进行相同的变换来保证相对位置不变，旋转完成后再逆平移变换回去就好了。

因此我们首先设初始旋转轴过空间中一点 \(P_0 = (x_0, y_0, z_0)\)，其单位方向向量 \(u = (u_x, u_y, u_z)\)，那么我们可以得到每一步的矩阵：

<div class="math-display">
$$
T = \begin{bmatrix} 1 & 0 & 0 & -x_0 \\ 0 & 1 & 0 & -y_0 \\ 0 & 0 & 1 & -z_0 \\ 0 & 0 & 0 & 1 \end{bmatrix} \\ \\
R = \mathbf{I} + (\sin\phi)\mathbf{U} + (1-\cos\phi)\mathbf{U}^{2} \\ \\
T^{-1} = \begin{bmatrix} 1 & 0 & 0 & x_0 \\ 0 & 1 & 0 & y_0 \\ 0 & 0 & 1 & z_0 \\ 0 & 0 & 0 & 1 \end{bmatrix}
$$
</div>

只需要将 \(R\) 修改成齐次坐标形式 \(R_{homo}\)，那么我们就可以得到最终的变化矩阵

<div class="math-display">
$$
M = T^{-1} \cdot R_{homo} \cdot T
$$
</div>

这样的变换，我们也可以认为是从世界空间变换到了局部旋转空间，进行旋转再变换回世界空间，这正是我们下面要说明的**视图变换（View Transform）**概念的雏形。

### Normal Transformation

法线变换是比较特殊的，并且与后面的 Shading 部分关系紧密，因此我们需要专门推导。

假设存在一个表面向量 \(\mathbf{t}\)，其法向量为 \(\mathbf{n}\)，有 \(\mathbf{n}^T\mathbf{t} = 0\)。在物体经过变换 \(M\) 之后，其表面向量也会进行相应变换 \(\mathbf{t}' = M\mathbf{t}\)，但是法向量应该怎么变换呢？我们不妨设其变换为 \(N\)，有：

<div class="math-display">
$$
\mathbf{n}'^T\mathbf{t}' = (N\mathbf{n})^T(M\mathbf{t}) = \mathbf{n}^T(N^TM)\mathbf{t}
$$
</div>

我们的期望是，变化后的法线 \(\mathbf{n}'\) 与变化后的平面向量 \(\mathbf{t}'\) 依然垂直，不难观察得到，如果 \(N = (M^{-1})^T\)，那么就可以符合我们的要求：

<div class="math-display">
$$
\mathbf{n}'^T\mathbf{t}' = \mathbf{n}^T(M^{-1}M)\mathbf{t} = \mathbf{n}^T\mathbf{t} = 0
$$
</div>

有一点可以注意的是，如果变换矩阵 \(M\) 只包含旋转（Rotation）和等比缩放（Uniform Scale），那么它本质上是一个正交矩阵（的常数倍）。对于正交矩阵，存在数学性质 \((M^{-1})^T = M\)。这意味着在这种情况下，法线**可以直接使用原顶点变换矩阵 \(M\) 进行变换**，从而省去求逆矩阵的昂贵计算开销。
