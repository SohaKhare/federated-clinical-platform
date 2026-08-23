import torch
import torch.nn.functional as F
from torch import nn


SHARED_LABELS = [
    "Atelectasis",
    "Cardiomegaly",
    "Consolidation",
    "Edema",
    "Pleural Effusion",
]


class ConvBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, stride: int = 1) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, stride=stride, padding=1, bias=False)
        self.norm1 = nn.GroupNorm(8, out_ch)
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False)
        self.norm2 = nn.GroupNorm(8, out_ch)
        self.shortcut = (
            nn.Identity()
            if stride == 1 and in_ch == out_ch
            else nn.Sequential(
                nn.Conv2d(in_ch, out_ch, 1, stride=stride, bias=False),
                nn.GroupNorm(8, out_ch),
            )
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = F.silu(self.norm1(self.conv1(x)))
        out = self.norm2(self.conv2(out))
        return F.silu(out + self.shortcut(x))


class ChestXrayCNN(nn.Module):
    def __init__(
        self,
        num_labels: int = len(SHARED_LABELS),
        in_channels: int = 1,
        width: int = 32,
        dropout: float = 0.2,
    ) -> None:
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(in_channels, width, 7, stride=2, padding=3, bias=False),
            nn.GroupNorm(8, width),
            nn.SiLU(),
            nn.MaxPool2d(3, stride=2, padding=1),
        )
        channels = [width * m for m in (1, 2, 4, 8)]
        blocks = []
        for i, ch in enumerate(channels):
            stride = 2 if i > 0 else 1
            blocks.append(ConvBlock(width if i == 0 else channels[i - 1], ch, stride))
            blocks.append(ConvBlock(ch, ch))
        self.stages = nn.Sequential(*blocks)
        self.head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Dropout(dropout),
            nn.Linear(channels[-1], num_labels),
        )

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        return self.head(self.stages(self.stem(images)))

    def predict_proba(self, images: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.forward(images))


def multi_label_loss(
    logits: torch.Tensor,
    targets: torch.Tensor,
    pos_weight: torch.Tensor | None = None,
) -> torch.Tensor:
    return F.binary_cross_entropy_with_logits(logits, targets, pos_weight=pos_weight)


class ClinicalModel(nn.Module):
    def __init__(self, input_size: int) -> None:
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, 32),
            nn.ReLU(),
            nn.Linear(32, 2),
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.network(features)
